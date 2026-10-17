import { InvalidStoryPointsError } from './errors';

export enum IssueType {
	Story = 'story',
	Task = 'task',
	Bug = 'bug',
	Epic = 'epic',
}

export enum IssuePriority {
	Highest = 'highest',
	High = 'high',
	Medium = 'medium',
	Low = 'low',
	Lowest = 'lowest',
}

/** Directed relationship stored on the source issue; each kind has an inverse stored on the target. */
export enum IssueLinkKind {
	Blocks = 'blocks',
	BlockedBy = 'blocked_by',
	RelatesTo = 'relates_to',
	Duplicates = 'duplicates',
	DuplicatedBy = 'duplicated_by',
}

const INVERSE_LINK_KIND: Readonly<Record<IssueLinkKind, IssueLinkKind>> = {
	[IssueLinkKind.Blocks]: IssueLinkKind.BlockedBy,
	[IssueLinkKind.BlockedBy]: IssueLinkKind.Blocks,
	[IssueLinkKind.RelatesTo]: IssueLinkKind.RelatesTo,
	[IssueLinkKind.Duplicates]: IssueLinkKind.DuplicatedBy,
	[IssueLinkKind.DuplicatedBy]: IssueLinkKind.Duplicates,
};

export function inverseLinkKind(kind: IssueLinkKind): IssueLinkKind {
	return INVERSE_LINK_KIND[kind];
}

export const ISSUE_LINK_KINDS: readonly IssueLinkKind[] = Object.values(IssueLinkKind);

export type IssueLinks = Readonly<Record<IssueLinkKind, readonly string[]>>;

export function emptyIssueLinks(): IssueLinks {
	return {
		[IssueLinkKind.Blocks]: [],
		[IssueLinkKind.BlockedBy]: [],
		[IssueLinkKind.RelatesTo]: [],
		[IssueLinkKind.Duplicates]: [],
		[IssueLinkKind.DuplicatedBy]: [],
	};
}

export interface Issue {
	/** Unique key such as `OB-12`; also the note's file name. */
	readonly key: string;
	readonly summary: string;
	readonly type: IssueType;
	/** Id of a status in the configured workflow. */
	readonly status: string;
	readonly priority: IssuePriority;
	readonly points: number | null;
	/** Name of the sprint the issue is planned into; null means backlog. */
	readonly sprint: string | null;
	/** Global ordering; lower ranks appear first. */
	readonly rank: number;
	readonly assignee: string | null;
	/** Key of the parent issue (usually an epic). */
	readonly parent: string | null;
	/** Links as written on this issue's own note. */
	readonly links: IssueLinks;
	/** Local date (YYYY-MM-DD) the issue was created. */
	readonly created: string | null;
	/** Local date (YYYY-MM-DD) the issue last entered a Done status. */
	readonly resolved: string | null;
	/** Web address of the GitHub or GitLab issue this one was pulled from; null for issues created here. */
	readonly source: string | null;
}

export type IssueChanges = Partial<Omit<Issue, 'key'>>;

/**
 * Parses user-entered story points; blank means unestimated.
 * @throws InvalidStoryPointsError when the text is not a non-negative number.
 */
export function parseStoryPoints(text: string): number | null {
	if (text.trim() === '') return null;
	const points = Number(text);
	if (!Number.isFinite(points) || points < 0) throw new InvalidStoryPointsError(text);
	return points;
}

/** @throws InvalidStoryPointsError when points are negative or not finite. */
export function assertValidStoryPoints(points: number | null): void {
	if (points !== null && (!Number.isFinite(points) || points < 0)) throw new InvalidStoryPointsError(String(points));
}

export function totalPoints(issues: readonly Issue[]): number {
	return issues.reduce((sum, issue) => sum + (issue.points ?? 0), 0);
}
