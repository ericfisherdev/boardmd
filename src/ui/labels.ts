import { IssueLinkKind, IssuePriority, IssueType } from '../domain/issue';
import { SprintState } from '../domain/sprint';
import { StatusCategory } from '../domain/workflow';

interface Presentation {
	readonly label: string;
	readonly icon: string;
}

export const ISSUE_TYPE_PRESENTATION: Readonly<Record<IssueType, Presentation>> = {
	[IssueType.Story]: { label: 'Story', icon: 'bookmark' },
	[IssueType.Task]: { label: 'Task', icon: 'square-check' },
	[IssueType.Bug]: { label: 'Bug', icon: 'bug' },
	[IssueType.Epic]: { label: 'Epic', icon: 'zap' },
};

export const PRIORITY_PRESENTATION: Readonly<Record<IssuePriority, Presentation>> = {
	[IssuePriority.Highest]: { label: 'Highest', icon: 'chevrons-up' },
	[IssuePriority.High]: { label: 'High', icon: 'chevron-up' },
	[IssuePriority.Medium]: { label: 'Medium', icon: 'equal' },
	[IssuePriority.Low]: { label: 'Low', icon: 'chevron-down' },
	[IssuePriority.Lowest]: { label: 'Lowest', icon: 'chevrons-down' },
};

/** How a link reads from the issue it is written on, e.g. "OB-1 blocks OB-2". */
export const LINK_KIND_LABEL: Readonly<Record<IssueLinkKind, string>> = {
	[IssueLinkKind.Blocks]: 'blocks',
	[IssueLinkKind.BlockedBy]: 'is blocked by',
	[IssueLinkKind.RelatesTo]: 'relates to',
	[IssueLinkKind.Duplicates]: 'duplicates',
	[IssueLinkKind.DuplicatedBy]: 'is duplicated by',
};

/** Field headings for links, e.g. "Is blocked by". */
export const LINK_KIND_HEADING: Readonly<Record<IssueLinkKind, string>> = {
	[IssueLinkKind.Blocks]: 'Blocks',
	[IssueLinkKind.BlockedBy]: 'Is blocked by',
	[IssueLinkKind.RelatesTo]: 'Relates to',
	[IssueLinkKind.Duplicates]: 'Duplicates',
	[IssueLinkKind.DuplicatedBy]: 'Is duplicated by',
};

export const STATUS_CATEGORY_LABEL: Readonly<Record<StatusCategory, string>> = {
	[StatusCategory.ToDo]: 'To do',
	[StatusCategory.InProgress]: 'In progress',
	[StatusCategory.Done]: 'Done',
};

export const SPRINT_STATE_LABEL: Readonly<Record<SprintState, string>> = {
	[SprintState.Future]: 'Planned',
	[SprintState.Active]: 'Active',
	[SprintState.Closed]: 'Closed',
};

/** Dropdown options (`value → label`) for an enum's presentation table. */
export function presentationOptions<E extends string>(presentation: Readonly<Record<E, Presentation>>): Record<E, string> {
	const entries = Object.entries(presentation) as [E, Presentation][];
	return Object.fromEntries(entries.map(([value, { label }]) => [value, label])) as Record<E, string>;
}

export function pointsLabel(points: number): string {
	return `${points} ${points === 1 ? 'pt' : 'pts'}`;
}
