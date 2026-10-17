import { RemoteIssue, RemoteIssueState } from '../../domain/repository';

type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function issueNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function labelNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((label) => (typeof label === 'string' ? label : text(asObject(label)?.['name'])))
		.filter((name) => name !== '');
}

function firstName(people: unknown, field: string): string | null {
	if (!Array.isArray(people)) return null;
	const name = text(asObject(people[0])?.[field]);
	return name === '' ? null : name;
}

/** A GitHub issue from the REST API; pull requests (which GitHub lists among issues) and malformed items give null. */
export function readGitHubIssue(item: unknown): RemoteIssue | null {
	const data = asObject(item);
	const number = issueNumber(data?.['number']);
	if (!data || number === null || data['pull_request'] !== undefined) return null;
	const assignee = text(asObject(data['assignee'])?.['login']);
	return {
		number,
		title: text(data['title']),
		body: text(data['body']),
		state: data['state'] === 'closed' ? RemoteIssueState.Closed : RemoteIssueState.Open,
		labels: labelNames(data['labels']),
		assignee: assignee !== '' ? assignee : firstName(data['assignees'], 'login'),
	};
}

/** A GitLab issue from the REST API; malformed items give null. */
export function readGitLabIssue(item: unknown): RemoteIssue | null {
	const data = asObject(item);
	const number = issueNumber(data?.['iid']);
	if (!data || number === null) return null;
	return {
		number,
		title: text(data['title']),
		body: text(data['description']),
		state: data['state'] === 'closed' ? RemoteIssueState.Closed : RemoteIssueState.Open,
		labels: labelNames(data['labels']),
		assignee: firstName(data['assignees'], 'username'),
	};
}
