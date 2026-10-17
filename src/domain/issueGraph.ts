import { emptyIssueLinks, inverseLinkKind, Issue, ISSUE_LINK_KINDS, IssueLinkKind, IssueLinks } from './issue';
import { byRank } from './ranking';

/**
 * Relationships between issues, resolved in both directions. A link written on only one
 * note (for example after a manual edit) still appears on both issues.
 */
export class IssueGraph {
	private readonly issuesByKey: ReadonlyMap<string, Issue>;
	private readonly resolvedLinks: ReadonlyMap<string, IssueLinks>;
	private readonly childrenByParent: ReadonlyMap<string, readonly string[]>;

	constructor(issues: readonly Issue[]) {
		this.issuesByKey = new Map(issues.map((issue) => [issue.key, issue]));
		this.resolvedLinks = resolveLinks(issues, this.issuesByKey);
		this.childrenByParent = groupChildren(issues, this.issuesByKey);
	}

	linksOf(key: string): IssueLinks {
		return this.resolvedLinks.get(key) ?? emptyIssueLinks();
	}

	childrenOf(key: string): readonly string[] {
		return this.childrenByParent.get(key) ?? [];
	}

	/** Keys of blockers that are not yet done. */
	openBlockersOf(key: string, isDone: (statusId: string) => boolean): string[] {
		return this.linksOf(key)[IssueLinkKind.BlockedBy].filter((blockerKey) => {
			const blocker = this.issuesByKey.get(blockerKey);
			return blocker !== undefined && !isDone(blocker.status);
		});
	}

	/** True when `ancestorKey` is `key` itself or appears above it in the parent chain. */
	isSelfOrAncestor(ancestorKey: string, key: string): boolean {
		const visited = new Set<string>();
		let current: string | null = key;
		while (current !== null && !visited.has(current)) {
			if (current === ancestorKey) return true;
			visited.add(current);
			current = this.issuesByKey.get(current)?.parent ?? null;
		}
		return false;
	}
}

function resolveLinks(issues: readonly Issue[], issuesByKey: ReadonlyMap<string, Issue>): Map<string, IssueLinks> {
	const sets = new Map<string, Record<IssueLinkKind, Set<string>>>();
	const setsFor = (key: string) => {
		let entry = sets.get(key);
		if (!entry) {
			entry = Object.fromEntries(ISSUE_LINK_KINDS.map((kind) => [kind, new Set<string>()])) as Record<
				IssueLinkKind,
				Set<string>
			>;
			sets.set(key, entry);
		}
		return entry;
	};
	for (const issue of issues) {
		for (const kind of ISSUE_LINK_KINDS) {
			for (const target of issue.links[kind]) {
				if (target === issue.key || !issuesByKey.has(target)) continue;
				setsFor(issue.key)[kind].add(target);
				setsFor(target)[inverseLinkKind(kind)].add(issue.key);
			}
		}
	}
	const resolved = new Map<string, IssueLinks>();
	for (const [key, kinds] of sets) {
		resolved.set(
			key,
			Object.fromEntries(
				ISSUE_LINK_KINDS.map((kind) => [kind, sortKeys([...kinds[kind]], issuesByKey)]),
			) as unknown as IssueLinks,
		);
	}
	return resolved;
}

function groupChildren(issues: readonly Issue[], issuesByKey: ReadonlyMap<string, Issue>): Map<string, string[]> {
	const children = new Map<string, string[]>();
	for (const issue of [...issues].sort(byRank)) {
		if (issue.parent === null || !issuesByKey.has(issue.parent)) continue;
		children.set(issue.parent, [...(children.get(issue.parent) ?? []), issue.key]);
	}
	return children;
}

function sortKeys(keys: string[], issuesByKey: ReadonlyMap<string, Issue>): string[] {
	return keys
		.map((key) => issuesByKey.get(key))
		.filter((issue): issue is Issue => issue !== undefined)
		.sort(byRank)
		.map((issue) => issue.key);
}
