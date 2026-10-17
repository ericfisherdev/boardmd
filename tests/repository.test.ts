import { describe, expect, it } from 'vitest';
import { RepositoryIssueSource } from './repositoryFakes';
import { InvalidRepositoryError, RepositoryRequestError, RepositoryTooLargeError } from '../src/domain/errors';
import { planImport } from '../src/domain/importPlan';
import { IssuePriority, IssueType } from '../src/domain/issue';
import {
	describeRepository,
	guessProvider,
	issueWebUrl,
	parseRepositoryUrl,
	RemoteIssue,
	RemoteIssueState,
	RepositoryLink,
	RepositoryProvider,
} from '../src/domain/repository';
import { EXTENDED_WORKFLOW, SIMPLE_WORKFLOW, Workflow } from '../src/domain/workflow';
import { keepOutOfFrontmatter } from '../src/infrastructure/noteBody';
import { sanitizeSettings } from '../src/settings/settings';
import { anIssue } from './fakes';

const GITHUB = RepositoryProvider.GitHub;
const GITLAB = RepositoryProvider.GitLab;

describe('parseRepositoryUrl', () => {
	it('reads GitHub addresses in the forms people paste', () => {
		const expected = { provider: GITHUB, host: 'github.com', path: 'octo/spoon' };
		expect(parseRepositoryUrl(GITHUB, 'https://github.com/octo/spoon')).toEqual(expected);
		expect(parseRepositoryUrl(GITHUB, 'https://github.com/octo/spoon.git')).toEqual(expected);
		expect(parseRepositoryUrl(GITHUB, 'https://GitHub.com/octo/spoon/issues/12?x=1')).toEqual(expected);
		expect(parseRepositoryUrl(GITHUB, 'github.com/octo/spoon/')).toEqual(expected);
	});

	it('reads GitLab addresses with groups and stops at the /-/ marker', () => {
		expect(parseRepositoryUrl(GITLAB, 'https://gitlab.example.com/team/sub/app/-/issues')).toEqual({
			provider: GITLAB,
			host: 'gitlab.example.com',
			path: 'team/sub/app',
		});
		expect(parseRepositoryUrl(GITLAB, 'https://gitlab.com/team/app.git').path).toBe('team/app');
	});

	it('keeps a custom port as part of the host', () => {
		expect(parseRepositoryUrl(GITLAB, 'https://git.local:8443/team/app').host).toBe('git.local:8443');
	});

	it('rejects addresses that are unsafe or incomplete', () => {
		const bad = ['', 'http://github.com/o/r', 'https://github.com/onlyowner', 'https://user:pw@github.com/o/r', 'https://github.com/o/../r', 'ftp://x/o/r', 'https://github.com/o/r r'];
		bad.forEach((input) => expect(() => parseRepositoryUrl(GITHUB, input)).toThrow(InvalidRepositoryError));
		expect(() => parseRepositoryUrl(GITLAB, 'https://gitlab.com/justone')).toThrow(InvalidRepositoryError);
	});
});

describe('repository addresses', () => {
	const github = { provider: GITHUB, host: 'github.com', path: 'octo/spoon' };
	const gitlab = { provider: GITLAB, host: 'gitlab.example.com', path: 'team/app' };

	it('builds the web address of an issue for each service', () => {
		expect(issueWebUrl(github, 12)).toBe('https://github.com/octo/spoon/issues/12');
		expect(issueWebUrl(gitlab, 3)).toBe('https://gitlab.example.com/team/app/-/issues/3');
	});

	it('guesses the service from well-known host names and describes repositories briefly', () => {
		expect(guessProvider('github.com')).toBe(GITHUB);
		expect(guessProvider('gitlab.example.com')).toBe(GITLAB);
		expect(guessProvider('git.example.com')).toBeNull();
		expect(describeRepository(github)).toBe('octo/spoon');
		expect(describeRepository(gitlab)).toBe('gitlab.example.com/team/app');
	});
});

describe('planImport', () => {
	const link: RepositoryLink = { provider: GITHUB, host: 'github.com', path: 'octo/spoon', tokenSecretId: null, includeClosed: false, lastPulledAt: null };
	const workflow = new Workflow(EXTENDED_WORKFLOW);
	const today = '2026-10-16';
	const remote = (number: number, overrides: Partial<RemoteIssue> = {}): RemoteIssue => ({
		number,
		title: `Remote ${number}`,
		body: 'Body',
		state: RemoteIssueState.Open,
		labels: [],
		assignee: null,
		...overrides,
	});
	const plan = (issues: RemoteIssue[], local = [] as ReturnType<typeof anIssue>[], overrides: Partial<RepositoryLink> = {}) =>
		planImport({ remote: issues, local, link: { ...link, ...overrides }, workflow, today });

	it('creates backlog issues in number order, typed from labels, in the first to-do status', () => {
		const result = plan([remote(2, { labels: ['bug'] }), remote(1, { labels: ['Enhancement'] }), remote(3, { labels: ['docs'] }), remote(4, { labels: ['epic'] })]);
		expect(result.create.map((c) => [c.source, c.type, c.status])).toEqual([
			['https://github.com/octo/spoon/issues/1', IssueType.Story, 'todo'],
			['https://github.com/octo/spoon/issues/2', IssueType.Bug, 'todo'],
			['https://github.com/octo/spoon/issues/3', IssueType.Task, 'todo'],
			['https://github.com/octo/spoon/issues/4', IssueType.Epic, 'todo'],
		]);
		expect(result.create[0]).toMatchObject({ priority: IssuePriority.Medium, resolved: null, description: 'Body' });
	});

	it('does not match a label that merely contains "bug"', () => {
		expect(plan([remote(1, { labels: ['debugging'] })]).create[0]?.type).toBe(IssueType.Task);
	});

	it('skips closed issues that are not on the board yet unless asked, then imports them as done', () => {
		const closed = remote(5, { state: RemoteIssueState.Closed });
		expect(plan([closed]).create).toEqual([]);
		expect(plan([closed], [], { includeClosed: true }).create[0]).toMatchObject({ status: 'done', resolved: today });
	});

	it('normalises line endings and trims the description', () => {
		expect(plan([remote(1, { body: '\r\n  Line one\r\nLine two  \r\n' })]).create[0]?.description).toBe('Line one\nLine two');
		expect(plan([remote(1, { title: '   ' })]).create[0]?.summary).toBe('Issue #1');
	});

	it('updates only what the repository owns and leaves board-owned fields alone', () => {
		const local = anIssue('OB-7', {
			source: 'https://github.com/octo/spoon/issues/9',
			summary: 'Old title',
			assignee: null,
			status: 'in-review',
			sprint: 'Sprint 2',
			points: 5,
			priority: IssuePriority.High,
			rank: 4000,
		});
		const result = plan([remote(9, { title: 'New title', assignee: 'ada' })], [local]);
		expect(result.create).toEqual([]);
		expect(result.update).toEqual([{ key: 'OB-7', changes: { summary: 'New title', assignee: 'ada' } }]);
	});

	it('moves a closed issue to done and a reopened one back, but keeps progress on open ones', () => {
		const source = (n: number) => `https://github.com/octo/spoon/issues/${n}`;
		const inReview = anIssue('OB-1', { source: source(1), summary: 'Remote 1', status: 'in-review' });
		const done = anIssue('OB-2', { source: source(2), summary: 'Remote 2', status: 'done', resolved: '2026-10-01' });
		const open = plan([remote(1), remote(2)], [inReview, done]);
		expect(open.update).toEqual([{ key: 'OB-2', changes: { status: 'todo', resolved: null } }]);
		expect(open.unchanged).toBe(1);
		const closedNow = plan([remote(1, { state: RemoteIssueState.Closed })], [inReview]);
		expect(closedNow.update).toEqual([{ key: 'OB-1', changes: { status: 'done', resolved: today } }]);
	});

	it('does not touch a closed issue that is already done, or issues pulled from another repository', () => {
		const done = anIssue('OB-2', { source: 'https://github.com/octo/spoon/issues/2', summary: 'Remote 2', status: 'done' });
		expect(plan([remote(2, { state: RemoteIssueState.Closed })], [done])).toMatchObject({ update: [], unchanged: 1 });
		const other = anIssue('OB-3', { source: 'https://github.com/other/repo/issues/2', summary: 'Remote 2' });
		expect(plan([remote(2)], [other]).create).toHaveLength(1);
	});

	it('uses the first done status of a project with a different workflow', () => {
		const simple = new Workflow(SIMPLE_WORKFLOW);
		const result = planImport({ remote: [remote(1, { state: RemoteIssueState.Closed })], local: [], link: { ...link, includeClosed: true }, workflow: simple, today });
		expect(result.create[0]?.status).toBe('done');
	});
});

describe('note bodies', () => {
	it('never start with a frontmatter fence', () => {
		expect(keepOutOfFrontmatter('---\ntitle: x\n---\ntext')).toBe('\n---\ntitle: x\n---\ntext');
		expect(keepOutOfFrontmatter('  \n---\nfoo')).toBe('\n  \n---\nfoo');
		expect(keepOutOfFrontmatter('plain\n---\nfoo')).toBe('plain\n---\nfoo');
		expect(keepOutOfFrontmatter('--- not a fence')).toBe('--- not a fence');
	});
});

describe('repository settings', () => {
	it('keeps a valid link and drops one with an unsafe host or path', () => {
		const good = { provider: 'gitlab', host: 'gitlab.example.com', path: 'team/app', tokenSecretId: 'gl-token', includeClosed: true, lastPulledAt: '2026-10-16T10:00:00.000Z' };
		const settings = sanitizeSettings({ projects: { A: { repository: good }, B: { repository: { ...good, host: 'evil.com/@x' } }, C: { repository: { ...good, path: '../x' } }, D: { repository: { ...good, provider: 'bitbucket' } } } });
		expect(settings.projects.A?.repository).toEqual(good);
		expect(settings.projects.B?.repository).toBeNull();
		expect(settings.projects.C?.repository).toBeNull();
		expect(settings.projects.D?.repository).toBeNull();
		expect(sanitizeSettings({ projects: { A: { repository: { ...good, lastPulledAt: 'garbage' } } } }).projects.A?.repository?.lastPulledAt).toBeNull();
	});
});

describe('GitHub and GitLab clients', () => {
	const link = (overrides: Partial<RepositoryLink>): RepositoryLink => ({
		provider: GITHUB,
		host: 'github.com',
		path: 'octo/spoon',
		tokenSecretId: null,
		includeClosed: false,
		lastPulledAt: null,
		...overrides,
	});

	it('asks GitHub.com for issues in pages, with the token only when there is one, and skips pull requests', async () => {
		const harness = new RepositoryIssueSource();
		harness.respond(200, [
			{ number: 2, title: 'Second', body: null, state: 'open', labels: [{ name: 'bug' }], assignee: { login: 'ada' } },
			{ number: 3, title: 'A pull request', pull_request: {}, state: 'open' },
			{ nope: true },
		]);
		const issues = await harness.github.fetchIssues({ link: link({}), token: 'secret', state: 'open', updatedSince: '2026-10-01T00:00:00Z' });
		expect(issues).toEqual([{ number: 2, title: 'Second', body: '', state: RemoteIssueState.Open, labels: ['bug'], assignee: 'ada' }]);
		const [request] = harness.requests;
		expect(request?.url).toBe('https://api.github.com/repos/octo/spoon/issues?state=open&per_page=100&sort=created&direction=asc&since=2026-10-01T00%3A00%3A00Z');
		expect(request?.headers['Authorization']).toBe('Bearer secret');
		const anonymous = new RepositoryIssueSource();
		anonymous.respond(200, []);
		await anonymous.github.fetchIssues({ link: link({}), token: null, state: 'all', updatedSince: null });
		expect(anonymous.requests[0]?.headers['Authorization']).toBeUndefined();
	});

	it('uses the /api/v3 root for GitHub Enterprise and the project path encoded for GitLab', async () => {
		const enterprise = new RepositoryIssueSource();
		enterprise.respond(200, []);
		await enterprise.github.fetchIssues({ link: link({ host: 'git.corp.example' }), token: null, state: 'open', updatedSince: null });
		expect(enterprise.requests[0]?.url.startsWith('https://git.corp.example/api/v3/repos/octo/spoon/issues?')).toBe(true);
		const gitlab = new RepositoryIssueSource();
		gitlab.respond(200, [{ iid: 4, title: 'T', description: 'D', state: 'closed', labels: ['feature'], assignees: [{ username: 'grace' }] }]);
		const issues = await gitlab.gitlab.fetchIssues({
			link: link({ provider: GITLAB, host: 'gitlab.example.com', path: 'team/sub/app' }),
			token: 'glpat',
			state: 'open',
			updatedSince: '2026-10-01T00:00:00Z',
		});
		expect(issues).toEqual([{ number: 4, title: 'T', body: 'D', state: RemoteIssueState.Closed, labels: ['feature'], assignee: 'grace' }]);
		expect(gitlab.requests[0]?.url).toBe('https://gitlab.example.com/api/v4/projects/team%2Fsub%2Fapp/issues?state=opened&per_page=100&order_by=created_at&sort=asc&updated_after=2026-10-01T00%3A00%3A00Z');
		expect(gitlab.requests[0]?.headers['PRIVATE-TOKEN']).toBe('glpat');
	});

	it('follows next links on the same site only, so a token is never sent elsewhere', async () => {
		const paged = new RepositoryIssueSource();
		paged.respond(200, [{ number: 1, title: 'a', state: 'open' }], { link: '<https://api.github.com/repos/octo/spoon/issues?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"' });
		paged.respond(200, [{ number: 2, title: 'b', state: 'open' }]);
		expect((await paged.github.fetchIssues({ link: link({}), token: 't', state: 'all', updatedSince: null })).map((i) => i.number)).toEqual([1, 2]);
		const hostile = new RepositoryIssueSource();
		hostile.respond(200, [{ number: 1, title: 'a', state: 'open' }], { link: '<https://evil.example/steal>; rel="next"' });
		await hostile.github.fetchIssues({ link: link({}), token: 't', state: 'all', updatedSince: null });
		expect(hostile.requests).toHaveLength(1);
	});

	it('explains failures without mentioning the token', async () => {
		const reasons: [number, Record<string, string>, RegExp][] = [
			[401, {}, /token was rejected/],
			[404, {}, /not found/],
			[403, { 'x-ratelimit-remaining': '0' }, /rate limit/],
			[429, {}, /rate limit/],
			[403, {}, /denied/],
			[500, {}, /status 500/],
		];
		for (const [status, headers, message] of reasons) {
			const failing = new RepositoryIssueSource();
			failing.respond(status, null, headers);
			const error = await failing.github.fetchIssues({ link: link({}), token: 'topsecret', state: 'all', updatedSince: null }).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(RepositoryRequestError);
			expect((error as Error).message).toMatch(message);
			expect((error as Error).message).not.toContain('topsecret');
		}
	});

	it('refuses answers that are not a list, and repositories with too many pages', async () => {
		const odd = new RepositoryIssueSource();
		odd.respond(200, { message: 'not a list' });
		await expect(odd.github.fetchIssues({ link: link({}), token: null, state: 'all', updatedSince: null })).rejects.toThrow(RepositoryRequestError);
		const endless = new RepositoryIssueSource();
		endless.respondForever(200, [{ number: 1, title: 'a', state: 'open' }], { link: '<https://api.github.com/repos/octo/spoon/issues?page=2>; rel="next"' });
		await expect(endless.github.fetchIssues({ link: link({}), token: null, state: 'all', updatedSince: null })).rejects.toThrow(RepositoryTooLargeError);
	});
});
