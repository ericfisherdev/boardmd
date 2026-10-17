import type { IssueItemModel } from './issueItem';

/** Draws one issue under `parent` and returns the element it created. */
export type IssueItemRenderer = (parent: HTMLElement, model: IssueItemModel) => HTMLElement;

/**
 * Remembers each issue's element so a board refresh re-attaches it instead of rebuilding it.
 * An element is only redrawn when something it displays has changed.
 */
export class IssueItemCache {
	private readonly entries = new Map<string, { signature: string; element: HTMLElement }>();

	constructor(private readonly render: IssueItemRenderer) {}

	/** Appends the issue's element to `parent` (moving it there if it was elsewhere). */
	attach(parent: HTMLElement, model: IssueItemModel): void {
		const { key } = model.issue;
		const signature = issueItemSignature(model);
		const cached = this.entries.get(key);
		if (cached?.signature === signature) {
			parent.appendChild(cached.element);
			return;
		}
		cached?.element.remove();
		this.entries.set(key, { signature, element: this.render(parent, model) });
	}

	/** Forgets issues that no longer exist. */
	keepOnly(keys: ReadonlySet<string>): void {
		for (const [key, entry] of this.entries) {
			if (keys.has(key)) continue;
			entry.element.remove();
			this.entries.delete(key);
		}
	}

	clear(): void {
		this.keepOnly(new Set());
	}
}

/** Everything an issue row or card displays; two models with the same signature draw identically. */
export function issueItemSignature({ issue, status, openBlockers, parentSummary }: IssueItemModel): string {
	return JSON.stringify([
		issue.key,
		issue.summary,
		issue.type,
		issue.priority,
		issue.points,
		issue.assignee,
		issue.parent,
		status.id,
		status.name,
		status.category,
		openBlockers,
		parentSummary,
	]);
}
