import { inverseLinkKind, ISSUE_LINK_KINDS, IssueLinkKind, IssueLinks } from './issue';

export interface LinkRef {
	readonly kind: IssueLinkKind;
	readonly target: string;
}

export interface LinkDiff {
	readonly added: readonly LinkRef[];
	readonly removed: readonly LinkRef[];
}

/** Links that appear only in `after` (added) or only in `before` (removed). */
export function diffLinks(before: IssueLinks, after: IssueLinks): LinkDiff {
	const added: LinkRef[] = [];
	const removed: LinkRef[] = [];
	for (const kind of ISSUE_LINK_KINDS) {
		for (const target of after[kind]) if (!before[kind].includes(target)) added.push({ kind, target });
		for (const target of before[kind]) if (!after[kind].includes(target)) removed.push({ kind, target });
	}
	return { added, removed };
}

/**
 * What each issue note must change so both sides of every link in `diff` agree. The source note
 * records the diff as given; every other note records the inverse link back to the source.
 */
export function linkChangesPerIssue(source: string, diff: LinkDiff): Map<string, LinkDiff> {
	const perIssue = new Map<string, { added: LinkRef[]; removed: LinkRef[] }>();
	const changesFor = (key: string) => {
		const existing = perIssue.get(key) ?? { added: [], removed: [] };
		perIssue.set(key, existing);
		return existing;
	};
	for (const { kind, target } of diff.added) {
		changesFor(source).added.push({ kind, target });
		changesFor(target).added.push({ kind: inverseLinkKind(kind), target: source });
	}
	for (const { kind, target } of diff.removed) {
		changesFor(source).removed.push({ kind, target });
		changesFor(target).removed.push({ kind: inverseLinkKind(kind), target: source });
	}
	return perIssue;
}

/** `links` with the diff's removals and then additions applied; never introduces duplicates. */
export function applyLinkDiff(links: IssueLinks, diff: LinkDiff): IssueLinks {
	const result = Object.fromEntries(ISSUE_LINK_KINDS.map((kind) => [kind, [...links[kind]]])) as Record<IssueLinkKind, string[]>;
	for (const { kind, target } of diff.removed) result[kind] = result[kind].filter((existing) => existing !== target);
	for (const { kind, target } of diff.added) if (!result[kind].includes(target)) result[kind].push(target);
	return result;
}
