import { Issue, IssueChanges, IssuePriority, IssueType } from './issue';
import { issueWebUrl, RemoteIssue, RemoteIssueState, RepositoryLink } from './repository';
import { StatusCategory, Workflow } from './workflow';

/** A repository issue that is not on the board yet. */
export interface IssueToCreate {
	readonly source: string;
	readonly summary: string;
	readonly type: IssueType;
	readonly priority: IssuePriority;
	readonly status: string;
	readonly assignee: string | null;
	readonly description: string;
	/** Local date to record as resolved, for issues that arrive already closed. */
	readonly resolved: string | null;
}

export interface IssueToUpdate {
	readonly key: string;
	readonly changes: IssueChanges;
}

export interface ImportPlan {
	readonly create: readonly IssueToCreate[];
	readonly update: readonly IssueToUpdate[];
	/** Pulled issues that are already on the board and already match. */
	readonly unchanged: number;
}

export interface ImportInput {
	readonly remote: readonly RemoteIssue[];
	/** Every issue on the board; the ones whose `source` matches a pulled issue are updated. */
	readonly local: readonly Issue[];
	readonly link: RepositoryLink;
	readonly workflow: Workflow;
	/** Local date, used for the resolved date of issues that become done. */
	readonly today: string;
}

const TYPE_LABELS: readonly [RegExp, IssueType][] = [
	[/\bbug\b|\bdefect\b/i, IssueType.Bug],
	[/\bepic\b/i, IssueType.Epic],
	[/\bfeature\b|\benhancement\b|\bstory\b/i, IssueType.Story],
];

/**
 * Decides what a pull changes on the board. The repository owns an issue's title, assignee and
 * open/closed state; everything else (sprint, rank, points, priority, parent, links, description)
 * belongs to the board and is never overwritten. A closed issue is only moved to done, and a
 * reopened one only out of done, so progress made on the board is kept while the issue stays open.
 */
export function planImport({ remote, local, link, workflow, today }: ImportInput): ImportPlan {
	const bySource = new Map(local.flatMap((issue) => (issue.source === null ? [] : [[issue.source, issue] as const])));
	const create: IssueToCreate[] = [];
	const update: IssueToUpdate[] = [];
	let unchanged = 0;
	for (const issue of [...remote].sort((a, b) => a.number - b.number)) {
		const source = issueWebUrl(link, issue.number);
		const existing = bySource.get(source);
		if (!existing) {
			const planned = newIssue(issue, source, link, workflow, today);
			if (planned) create.push(planned);
			continue;
		}
		const changes = changesFor(existing, issue, workflow, today);
		if (Object.keys(changes).length === 0) unchanged++;
		else update.push({ key: existing.key, changes });
	}
	return { create, update, unchanged };
}

export function issueTypeFromLabels(labels: readonly string[]): IssueType {
	for (const [pattern, type] of TYPE_LABELS) {
		if (labels.some((label) => pattern.test(label))) return type;
	}
	return IssueType.Task;
}

function newIssue(issue: RemoteIssue, source: string, link: RepositoryLink, workflow: Workflow, today: string): IssueToCreate | null {
	const closed = issue.state === RemoteIssueState.Closed;
	if (closed && !link.includeClosed) return null;
	return {
		source,
		summary: summaryOf(issue),
		type: issueTypeFromLabels(issue.labels),
		priority: IssuePriority.Medium,
		status: closed ? doneStatusId(workflow) : workflow.initialStatus.id,
		assignee: issue.assignee,
		description: issue.body.replace(/\r\n?/g, '\n').trim(),
		resolved: closed ? today : null,
	};
}

function changesFor(existing: Issue, remote: RemoteIssue, workflow: Workflow, today: string): IssueChanges {
	const summary = summaryOf(remote);
	const closed = remote.state === RemoteIssueState.Closed;
	const isDone = workflow.isDone(existing.status);
	const statusChange: IssueChanges =
		closed && !isDone
			? { status: doneStatusId(workflow), resolved: today }
			: !closed && isDone
				? { status: workflow.initialStatus.id, resolved: null }
				: {};
	return {
		...(existing.summary === summary ? {} : { summary }),
		...(existing.assignee === remote.assignee ? {} : { assignee: remote.assignee }),
		...statusChange,
	};
}

function summaryOf(issue: RemoteIssue): string {
	const title = issue.title.trim();
	return title === '' ? `Issue #${issue.number}` : title;
}

/** The first status in the Done category. */
function doneStatusId(workflow: Workflow): string {
	const done = workflow.statuses.find((status) => status.category === StatusCategory.Done);
	if (!done) throw new Error('A workflow always has a Done status.');
	return done.id;
}
