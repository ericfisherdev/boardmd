import { ParentCycleError, SelfLinkError } from '../domain/errors';
import { Issue, IssueLinkKind } from '../domain/issue';
import { IssueGraph } from '../domain/issueGraph';
import { applyLinkDiff, LinkDiff, linkChangesPerIssue } from '../domain/linkDiff';
import { requireIssue } from './lookups';
import { IssueRepository } from './ports';

/** Keeps both sides of every link written, so each issue note describes its own relationships. */
export class IssueLinkCommands {
	constructor(private readonly issues: IssueRepository) {}

	/** @throws IssueNotFoundError, SelfLinkError */
	async link(sourceKey: string, kind: IssueLinkKind, targetKey: string): Promise<void> {
		await this.applyChanges(sourceKey, { added: [{ kind, target: targetKey }], removed: [] });
	}

	/** @throws IssueNotFoundError */
	async unlink(sourceKey: string, kind: IssueLinkKind, targetKey: string): Promise<void> {
		await this.applyChanges(sourceKey, { added: [], removed: [{ kind, target: targetKey }] });
	}

	/**
	 * Adds and removes several links of one issue, writing each affected note exactly once.
	 * Notes of removed links that no longer exist are skipped.
	 * @throws IssueNotFoundError, SelfLinkError
	 */
	async applyChanges(sourceKey: string, diff: LinkDiff): Promise<void> {
		requireIssue(this.issues, sourceKey);
		for (const { target } of diff.added) {
			if (target === sourceKey) throw new SelfLinkError(sourceKey);
			requireIssue(this.issues, target);
		}
		for (const [key, noteDiff] of linkChangesPerIssue(sourceKey, diff)) {
			if (!this.issues.exists(key)) continue;
			await this.issues.updateLinks(key, (links) => applyLinkDiff(links, noteDiff));
		}
	}

	/** @throws IssueNotFoundError, ParentCycleError */
	async setParent(key: string, parentKey: string | null): Promise<void> {
		requireIssue(this.issues, key);
		if (parentKey !== null) this.assertAcyclic(key, requireIssue(this.issues, parentKey));
		await this.issues.update(key, { parent: parentKey });
	}

	private assertAcyclic(key: string, parent: Issue): void {
		const graph = new IssueGraph(this.issues.findAll());
		if (graph.isSelfOrAncestor(key, parent.key)) throw new ParentCycleError(key, parent.key);
	}
}
