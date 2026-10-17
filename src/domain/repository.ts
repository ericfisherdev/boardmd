import { InvalidRepositoryError } from './errors';

export enum RepositoryProvider {
	GitHub = 'github',
	GitLab = 'gitlab',
}

/** Where a project's issues are pulled from. */
export interface RepositoryLink {
	readonly provider: RepositoryProvider;
	/** Host name of the service, e.g. `github.com` or a self-hosted `gitlab.example.com`. */
	readonly host: string;
	/** `owner/repo` on GitHub; `group/subgroup/project` on GitLab. */
	readonly path: string;
	/** Name of the secret (in Obsidian's secret storage) that holds the access token; null reads public issues only. */
	readonly tokenSecretId: string | null;
	/** Whether closed issues that are not in the project yet are imported too. */
	readonly includeClosed: boolean;
	/** ISO timestamp of the last successful pull; later pulls only ask for issues changed since. */
	readonly lastPulledAt: string | null;
}

export interface RepositoryAddress {
	readonly provider: RepositoryProvider;
	readonly host: string;
	readonly path: string;
}

export enum RemoteIssueState {
	Open = 'open',
	Closed = 'closed',
}

/** An issue as it exists in the repository, reduced to what the board uses. */
export interface RemoteIssue {
	/** The number shown in the repository (GitHub number, GitLab iid). */
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly state: RemoteIssueState;
	readonly labels: readonly string[];
	/** Login or username of the first assignee. */
	readonly assignee: string | null;
}

const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const GITHUB_HOST = 'github.com';
const GITLAB_PATH_END_MARKER = '-';

/**
 * Reads a repository web address such as `https://github.com/owner/repo`, with or without `.git`,
 * a trailing slash or a deeper page like `/issues`.
 * @throws InvalidRepositoryError when it is not an https address of a repository.
 */
export function parseRepositoryUrl(provider: RepositoryProvider, input: string): RepositoryAddress {
	const text = input.trim();
	if (text === '') throw new InvalidRepositoryError(input, 'enter the address of the repository.');
	const url = parseHttpsUrl(text);
	if (url === null) throw new InvalidRepositoryError(input, 'use a full https address, for example https://github.com/owner/repo.');
	if (url.username !== '' || url.password !== '') throw new InvalidRepositoryError(input, 'remove the user name and password from the address.');
	if (!isValidRepositoryHost(url.host)) throw new InvalidRepositoryError(input, 'the host name is not valid.');
	const segments = url.pathname.split('/').filter((segment) => segment !== '');
	const path = repositoryPath(provider, segments);
	if (path === null || !isValidRepositoryPath(path)) throw new InvalidRepositoryError(input, provider === RepositoryProvider.GitHub ? 'expected owner/repo.' : 'expected group/project.');
	return { provider, host: url.host.toLowerCase(), path };
}

function parseHttpsUrl(text: string): URL | null {
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
	try {
		const url = new URL(withScheme);
		return url.protocol === 'https:' ? url : null;
	} catch {
		return null;
	}
}

function repositoryPath(provider: RepositoryProvider, segments: readonly string[]): string | null {
	if (provider === RepositoryProvider.GitHub) {
		const [owner, repo] = segments;
		return owner && repo ? `${owner}/${repo.replace(/\.git$/, '')}` : null;
	}
	const marker = segments.indexOf(GITLAB_PATH_END_MARKER);
	const projectSegments = marker === -1 ? [...segments] : segments.slice(0, marker);
	const last = projectSegments.pop();
	if (projectSegments.length === 0 || !last) return null;
	return [...projectSegments, last.replace(/\.git$/, '')].join('/');
}

export function isValidRepositoryHost(host: string): boolean {
	return HOST_PATTERN.test(host);
}

/** Group, user and project names only use letters, digits, dots, underscores and hyphens. */
export function isValidRepositoryPath(path: string): boolean {
	const segments = path.split('/');
	return segments.length >= 2 && segments.every((segment) => PATH_SEGMENT_PATTERN.test(segment) && segment !== '.' && segment !== '..');
}

/** The service a host most likely is, when its name gives it away. */
export function guessProvider(host: string): RepositoryProvider | null {
	const name = host.toLowerCase();
	if (name === GITHUB_HOST) return RepositoryProvider.GitHub;
	return name.includes('gitlab') ? RepositoryProvider.GitLab : null;
}

/** Web address of an issue; this is what an imported issue records as its source. */
export function issueWebUrl(link: Pick<RepositoryLink, 'provider' | 'host' | 'path'>, issueNumber: number): string {
	const issuePath = link.provider === RepositoryProvider.GitHub ? 'issues' : '-/issues';
	return `https://${link.host}/${link.path}/${issuePath}/${issueNumber}`;
}

/** Short label such as `owner/repo`, for messages. */
export function describeRepository(link: Pick<RepositoryLink, 'host' | 'path'>): string {
	return link.host === GITHUB_HOST ? link.path : `${link.host}/${link.path}`;
}
