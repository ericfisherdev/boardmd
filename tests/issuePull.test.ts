import { beforeEach, describe, expect, it } from 'vitest';
import { IssuePullCommands } from '../src/application/IssuePullCommands';
import { RepositoryLinkCommands } from '../src/application/RepositoryLinkCommands';
import { RemoteIssueQuery, RemoteIssueSource, TokenStore, WriteSettlement } from '../src/application/ports';
import {
	InvalidRepositoryError,
	MissingTokenError,
	NoRepositoryLinkedError,
	PullInProgressError,
	PullInterruptedError,
	RepositoryRequestError,
} from '../src/domain/errors';
import { ProjectSettings } from '../src/domain/project';
import { RemoteIssue, RemoteIssueState, RepositoryLink, RepositoryProvider } from '../src/domain/repository';
import { EXTENDED_WORKFLOW } from '../src/domain/workflow';
import { FakeRegistry } from './projectFakes';
import { anIssue, aSprint, config, FixedClock, InMemoryIssueRepository, InMemorySprintRepository } from './fakes';

const LINK: RepositoryLink = {
	provider: RepositoryProvider.GitHub,
	host: 'github.com',
	path: 'octo/spoon',
	tokenSecretId: null,
	includeClosed: false,
	lastPulledAt: null,
};

class ScriptedSource implements RemoteIssueSource {
	readonly queries: RemoteIssueQuery[] = [];
	issues: RemoteIssue[] = [];
	failure: Error | null = null;
	onFetch: () => void = () => undefined;

	async fetchIssues(query: RemoteIssueQuery): Promise<RemoteIssue[]> {
		this.queries.push(query);
		this.onFetch();
		if (this.failure) throw this.failure;
		return this.issues;
	}
}

const remote = (number: number, overrides: Partial<RemoteIssue> = {}): RemoteIssue => ({
	number,
	title: `Remote ${number}`,
	body: `Body ${number}`,
	state: RemoteIssueState.Open,
	labels: [],
	assignee: null,
	...overrides,
});

function alphaAndBeta(): FakeRegistry {
	return new FakeRegistry(
		'Alpha',
		new Map<string, ProjectSettings>([
			['Alpha', { keyPrefix: 'AL', sprintLengthDays: 14, statuses: EXTENDED_WORKFLOW, repository: LINK }],
			['Beta', { keyPrefix: 'BE', sprintLengthDays: 14, statuses: EXTENDED_WORKFLOW, repository: null }],
		]),
	);
}

describe('IssuePullCommands', () => {
	let issues: InMemoryIssueRepository;
	let registry: FakeRegistry;
	let source: ScriptedSource;
	let tokens: Map<string, string>;
	let pull: IssuePullCommands;
	const settled: WriteSettlement = { whenSettled: () => Promise.resolve() };

	beforeEach(() => {
		issues = new InMemoryIssueRepository([anIssue('AL-1', { rank: 1000 }), anIssue('AL-2', { rank: 2000 })]);
		registry = alphaAndBeta();
		source = new ScriptedSource();
		tokens = new Map();
		const tokenStore: TokenStore = { tokenFor: (id) => tokens.get(id) ?? null };
		const settings = { ...config(EXTENDED_WORKFLOW), keyPrefix: 'AL' };
		pull = new IssuePullCommands(issues, new InMemorySprintRepository([aSprint('Sprint 1')]), settings, new FixedClock('2026-10-16'), registry, source, tokenStore, settled);
	});

	it('creates backlog issues with the next free keys, ranked after the backlog, remembering where they came from', async () => {
		source.issues = [remote(7, { labels: ['bug'], assignee: 'ada' }), remote(3)];
		const summary = await pull.pull();
		expect(summary).toEqual({ created: 2, updated: 0, unchanged: 0 });
		expect(issues.get('AL-3')).toMatchObject({
			summary: 'Remote 3',
			source: 'https://github.com/octo/spoon/issues/3',
			status: 'todo',
			rank: 3000,
			sprint: null,
			created: '2026-10-16',
		});
		expect(issues.get('AL-4')).toMatchObject({ summary: 'Remote 7', type: 'bug', assignee: 'ada', rank: 4000 });
		expect(issues.descriptions.get('AL-3')).toBe('Body 3');
	});

	it('does not import the same issue twice, and updates what the repository owns', async () => {
		source.issues = [remote(3)];
		await pull.pull();
		source.issues = [remote(3, { title: 'Renamed', state: RemoteIssueState.Closed })];
		const summary = await pull.pull();
		expect(summary).toEqual({ created: 0, updated: 1, unchanged: 0 });
		expect(issues.findAll().filter((issue) => issue.source !== null)).toHaveLength(1);
		expect(issues.get('AL-3')).toMatchObject({ summary: 'Renamed', status: 'done', resolved: '2026-10-16' });
	});

	it('asks only for open issues the first time, then for everything changed since the last pull, with a little overlap', async () => {
		await pull.pull();
		await pull.pull();
		expect(source.queries[0]).toMatchObject({ state: 'open', updatedSince: null });
		expect(registry.projects.get('Alpha')?.repository?.lastPulledAt).toBe('2026-10-16T12:00:00.000Z');
		expect(source.queries[1]).toMatchObject({ state: 'all', updatedSince: '2026-10-16T11:55:00Z' });
	});

	it('asks for all issues from the start when closed ones are wanted', async () => {
		registry.projects.set('Alpha', { ...(registry.projects.get('Alpha') as ProjectSettings), repository: { ...LINK, includeClosed: true } });
		await pull.pull();
		expect(source.queries[0]).toMatchObject({ state: 'all' });
	});

	it('sends the access token it finds in the secret store, and refuses to run without a secret it was told to use', async () => {
		registry.projects.set('Alpha', { ...(registry.projects.get('Alpha') as ProjectSettings), repository: { ...LINK, tokenSecretId: 'gh-token' } });
		await expect(pull.pull()).rejects.toThrow(MissingTokenError);
		expect(source.queries).toHaveLength(0);
		tokens.set('gh-token', 'ghp_value');
		await pull.pull();
		expect(source.queries[0]?.token).toBe('ghp_value');
	});

	it('needs a linked repository', async () => {
		registry.activeProject = 'Beta';
		await expect(pull.pull()).rejects.toThrow(NoRepositoryLinkedError);
	});

	it('records nothing when the server fails, so the next pull starts from the same point', async () => {
		source.failure = new RepositoryRequestError(500, 'the server answered with status 500.');
		await expect(pull.pull()).rejects.toThrow(RepositoryRequestError);
		expect(registry.projects.get('Alpha')?.repository?.lastPulledAt).toBeNull();
		expect(issues.findAll()).toHaveLength(2);
	});

	it('stops, writing nothing, when the board switches to another project during the request', async () => {
		source.issues = [remote(1)];
		source.onFetch = () => (registry.activeProject = 'Beta');
		await expect(pull.pull()).rejects.toThrow(PullInterruptedError);
		expect(issues.findAll()).toHaveLength(2);
		expect(registry.projects.get('Alpha')?.repository?.lastPulledAt).toBeNull();
	});

	it('refuses to run twice at once', async () => {
		source.issues = [remote(1)];
		const first = pull.pull();
		await expect(pull.pull()).rejects.toThrow(PullInProgressError);
		await first;
		await expect(pull.pull()).resolves.toBeDefined();
	});
});

describe('RepositoryLinkCommands', () => {
	let registry: FakeRegistry;
	let commands: RepositoryLinkCommands;

	beforeEach(() => {
		registry = alphaAndBeta();
		commands = new RepositoryLinkCommands(registry);
	});

	it('links a repository from its web address', async () => {
		registry.activeProject = 'Beta';
		await commands.link({ provider: RepositoryProvider.GitLab, url: 'https://gitlab.example.com/team/app/-/issues', tokenSecretId: 'gl', includeClosed: true });
		expect(commands.current()).toEqual({
			provider: RepositoryProvider.GitLab,
			host: 'gitlab.example.com',
			path: 'team/app',
			tokenSecretId: 'gl',
			includeClosed: true,
			lastPulledAt: null,
		});
		expect(registry.projects.get('Alpha')?.repository).toEqual(LINK);
	});

	it('rejects a bad address and keeps the existing link', async () => {
		await expect(commands.link({ provider: RepositoryProvider.GitHub, url: 'http://github.com/o/r', tokenSecretId: null, includeClosed: false })).rejects.toThrow(InvalidRepositoryError);
		expect(commands.current()).toEqual(LINK);
	});

	it('keeps the pull history when only the token changes, and starts over when the repository or import scope changes', async () => {
		registry.projects.set('Alpha', { ...(registry.projects.get('Alpha') as ProjectSettings), repository: { ...LINK, lastPulledAt: '2026-10-01T00:00:00.000Z' } });
		const same = { provider: RepositoryProvider.GitHub, url: 'https://github.com/octo/spoon', includeClosed: false };
		await commands.link({ ...same, tokenSecretId: 'new-token' });
		expect(commands.current()).toMatchObject({ tokenSecretId: 'new-token', lastPulledAt: '2026-10-01T00:00:00.000Z' });
		await commands.link({ ...same, tokenSecretId: 'new-token', includeClosed: true });
		expect(commands.current()?.lastPulledAt).toBeNull();
	});

	it('unlinks', async () => {
		await commands.unlink();
		expect(commands.current()).toBeNull();
	});
});
