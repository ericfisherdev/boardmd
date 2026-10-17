import { RemoteIssueQuery, RemoteIssueSource } from '../../application/ports';
import { RemoteIssue, RepositoryProvider } from '../../domain/repository';
import { HttpClient } from './HttpClient';
import { ISSUES_PER_PAGE, fetchAllPages } from './pagedIssues';
import { readGitHubIssue, readGitLabIssue } from './readers';

const GITHUB_API_HOST = 'github.com';

/** GitHub.com and GitHub Enterprise Server. */
export class GitHubIssueSource implements RemoteIssueSource {
	constructor(private readonly http: HttpClient) {}

	async fetchIssues({ link, token, state, updatedSince }: RemoteIssueQuery): Promise<RemoteIssue[]> {
		const parameters = new URLSearchParams({ state, per_page: String(ISSUES_PER_PAGE), sort: 'created', direction: 'asc' });
		if (updatedSince !== null) parameters.set('since', updatedSince);
		const apiRoot = link.host === GITHUB_API_HOST ? 'https://api.github.com' : `https://${link.host}/api/v3`;
		const repository = link.path.split('/').map(encodeURIComponent).join('/');
		const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
		if (token !== null) headers['Authorization'] = `Bearer ${token}`;
		const items = await fetchAllPages(this.http, `${apiRoot}/repos/${repository}/issues?${parameters.toString()}`, headers);
		return items.map(readGitHubIssue).filter((issue): issue is RemoteIssue => issue !== null);
	}
}

/** GitLab.com and self-managed GitLab. */
export class GitLabIssueSource implements RemoteIssueSource {
	constructor(private readonly http: HttpClient) {}

	async fetchIssues({ link, token, state, updatedSince }: RemoteIssueQuery): Promise<RemoteIssue[]> {
		const parameters = new URLSearchParams({
			state: state === 'open' ? 'opened' : 'all',
			per_page: String(ISSUES_PER_PAGE),
			order_by: 'created_at',
			sort: 'asc',
		});
		if (updatedSince !== null) parameters.set('updated_after', updatedSince);
		const project = encodeURIComponent(link.path);
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (token !== null) headers['PRIVATE-TOKEN'] = token;
		const items = await fetchAllPages(this.http, `https://${link.host}/api/v4/projects/${project}/issues?${parameters.toString()}`, headers);
		return items.map(readGitLabIssue).filter((issue): issue is RemoteIssue => issue !== null);
	}
}

/** Sends each query to the source for its repository's provider. */
export class RepositoryIssueSources implements RemoteIssueSource {
	constructor(private readonly sources: Readonly<Record<RepositoryProvider, RemoteIssueSource>>) {}

	fetchIssues(query: RemoteIssueQuery): Promise<RemoteIssue[]> {
		return this.sources[query.link.provider].fetchIssues(query);
	}
}
