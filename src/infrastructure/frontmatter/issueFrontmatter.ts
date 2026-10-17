import { Issue, IssueChanges, IssueLinkKind, IssueLinks, IssuePriority, IssueType } from '../../domain/issue';
import {
	Frontmatter,
	readDate,
	readEnum,
	readNoteReference,
	readNoteReferences,
	readNumber,
	readString,
	toWikilink,
	writeField,
} from './values';

/** How a sprint's name is written as a link in an issue note. */
export type SprintReference = (sprintName: string) => string;

/** Frontmatter field names on issue notes. Link fields reuse the {@link IssueLinkKind} values. */
export const ISSUE_FIELD = {
	summary: 'summary',
	type: 'type',
	status: 'status',
	priority: 'priority',
	points: 'points',
	sprint: 'sprint',
	rank: 'rank',
	assignee: 'assignee',
	parent: 'parent',
	created: 'created',
	resolved: 'resolved',
	source: 'source',
} as const;

const LINK_KINDS = Object.values(IssueLinkKind);

/** Reads an issue note; the key comes from the note's file name. Unknown values fall back to defaults. */
export function readIssue(key: string, frontmatter: Frontmatter, fallbackStatus: string): Issue {
	return {
		key,
		summary: readString(frontmatter[ISSUE_FIELD.summary]) ?? key,
		type: readEnum(Object.values(IssueType), frontmatter[ISSUE_FIELD.type], IssueType.Task),
		status: readString(frontmatter[ISSUE_FIELD.status]) ?? fallbackStatus,
		priority: readEnum(Object.values(IssuePriority), frontmatter[ISSUE_FIELD.priority], IssuePriority.Medium),
		points: readNumber(frontmatter[ISSUE_FIELD.points]),
		sprint: readNoteReference(frontmatter[ISSUE_FIELD.sprint]),
		rank: readNumber(frontmatter[ISSUE_FIELD.rank]) ?? Number.MAX_SAFE_INTEGER,
		assignee: readString(frontmatter[ISSUE_FIELD.assignee]),
		parent: readNoteReference(frontmatter[ISSUE_FIELD.parent]),
		links: readLinks(frontmatter),
		created: readDate(frontmatter[ISSUE_FIELD.created]),
		resolved: readDate(frontmatter[ISSUE_FIELD.resolved]),
		source: readString(frontmatter[ISSUE_FIELD.source]),
	};
}

export function readLinks(frontmatter: Frontmatter): IssueLinks {
	return Object.fromEntries(LINK_KINDS.map((kind) => [kind, readNoteReferences(frontmatter[kind])])) as Record<
		IssueLinkKind,
		string[]
	>;
}


/** Writes the changed fields into the frontmatter object in place. */
export function writeIssueChanges(
	frontmatter: Frontmatter,
	changes: IssueChanges,
	sprintReference: SprintReference = toWikilink,
): void {
	const references = {
		sprint: changes.sprint === undefined ? undefined : nullableLink(changes.sprint, sprintReference),
		parent: changes.parent === undefined ? undefined : nullableLink(changes.parent, toWikilink),
	};
	const fields: [string, unknown][] = [
		[ISSUE_FIELD.summary, changes.summary],
		[ISSUE_FIELD.type, changes.type],
		[ISSUE_FIELD.status, changes.status],
		[ISSUE_FIELD.priority, changes.priority],
		[ISSUE_FIELD.points, changes.points],
		[ISSUE_FIELD.sprint, references.sprint],
		[ISSUE_FIELD.rank, changes.rank],
		[ISSUE_FIELD.assignee, changes.assignee],
		[ISSUE_FIELD.parent, references.parent],
		[ISSUE_FIELD.created, changes.created],
		[ISSUE_FIELD.resolved, changes.resolved],
		[ISSUE_FIELD.source, changes.source],
	];
	for (const [field, value] of fields) {
		if (value !== undefined) writeField(frontmatter, field, value);
	}
	if (changes.links) writeLinks(frontmatter, changes.links);
}

export function writeLinks(frontmatter: Frontmatter, links: IssueLinks): void {
	for (const kind of LINK_KINDS) writeField(frontmatter, kind, links[kind].map(toWikilink));
}

function nullableLink(noteName: string | null, reference: SprintReference): string | null {
	return noteName === null ? null : reference(noteName);
}

/** Complete frontmatter for a new issue note, in a stable, readable field order. */
export function issueFrontmatter(issue: Issue, sprintReference: SprintReference = toWikilink): Frontmatter {
	const { key: _key, ...fields } = issue;
	const frontmatter: Frontmatter = {};
	writeIssueChanges(frontmatter, fields, sprintReference);
	return frontmatter;
}
