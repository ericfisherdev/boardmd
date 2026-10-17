import { IssueLinks } from '../domain/issue';
import { IssueGraph } from '../domain/issueGraph';
import { diffLinks } from '../domain/linkDiff';
import { hasChanges, IssueCommands, IssueDetails } from './IssueCommands';
import { IssueLinkCommands } from './IssueLinkCommands';
import { requireIssue } from './lookups';
import { IssueRepository } from './ports';

/** Everything the edit form can change in one submission. */
export interface IssueEdit {
	readonly details: IssueDetails;
	readonly status: string;
	readonly parent: string | null;
	/** The complete set of links the issue should have, in both directions. */
	readonly links: IssueLinks;
}

/** Applies a whole edit-form submission, writing only what actually changed. */
export class IssueEditCommands {
	constructor(
		private readonly issues: IssueRepository,
		private readonly issueCommands: IssueCommands,
		private readonly linkCommands: IssueLinkCommands,
	) {}

	/**
	 * Details and status are validated together and saved in one write; then the parent and the links
	 * are saved. A failure part-way leaves the earlier parts saved, and resubmitting the corrected
	 * form is safe.
	 * @throws IssueNotFoundError, InvalidIssueSummaryError, InvalidStoryPointsError, UnknownStatusError,
	 *   ParentCycleError, SelfLinkError
	 */
	async apply(key: string, edit: IssueEdit): Promise<void> {
		const issue = requireIssue(this.issues, key);
		const fieldChanges = {
			...this.issueCommands.detailChanges(issue, edit.details),
			...this.issueCommands.statusChange(issue, edit.status),
		};
		if (hasChanges(fieldChanges)) await this.issues.update(key, fieldChanges);
		if (edit.parent !== issue.parent) await this.linkCommands.setParent(key, edit.parent);
		const currentLinks = new IssueGraph(this.issues.findAll()).linksOf(key);
		await this.linkCommands.applyChanges(key, diffLinks(currentLinks, edit.links));
	}
}
