import { buildBoard, issuesInContainer } from '../domain/boardModels';
import { IssueNotInActiveSprintError, InvalidIssueSummaryError, NoActiveSprintError } from '../domain/errors';
import { assertValidStoryPoints, emptyIssueLinks, Issue, IssueChanges, IssuePriority, IssueType } from '../domain/issue';
import { nextFreeKeys } from '../domain/issueKey';
import { planPlacement, rankAfterLast, RankAssignment } from '../domain/ranking';
import { assertPlannable, requireIssue } from './lookups';
import { BoardConfig, Clock, IssueRepository, SprintReader } from './ports';

export interface IssueDraft {
	readonly summary: string;
	readonly type: IssueType;
	readonly priority: IssuePriority;
	readonly points: number | null;
	readonly assignee: string | null;
	/** Sprint to plan the issue into; null for the backlog. */
	readonly sprint: string | null;
	/** Key of the parent issue, if any. */
	readonly parent: string | null;
	readonly description: string;
}

/** Fields a user edits directly; placement, status and links have dedicated commands. */
export type IssueDetails = Pick<Issue, 'summary' | 'type' | 'priority' | 'points' | 'assignee'>;

export class IssueCommands {
	constructor(
		private readonly issues: IssueRepository,
		private readonly sprints: SprintReader,
		private readonly config: BoardConfig,
		private readonly clock: Clock,
	) {}

	/** @throws InvalidIssueSummaryError, InvalidStoryPointsError, IssueNotFoundError, SprintNotFoundError, SprintClosedError */
	async create(draft: IssueDraft): Promise<Issue> {
		const summary = requireSummary(draft.summary);
		assertValidStoryPoints(draft.points);
		assertPlannable(this.sprints, draft.sprint);
		if (draft.parent !== null) requireIssue(this.issues, draft.parent);
		const issue: Issue = {
			key: this.nextFreeKey(),
			summary,
			type: draft.type,
			status: this.config.workflow.initialStatus.id,
			priority: draft.priority,
			points: draft.points,
			sprint: draft.sprint,
			rank: rankAfterLast(this.containerIssues(draft.sprint)),
			assignee: draft.assignee,
			parent: draft.parent,
			links: emptyIssueLinks(),
			created: this.clock.today(),
			resolved: null,
			source: null,
		};
		await this.issues.create(issue, draft.description);
		return issue;
	}

	/** @throws IssueNotFoundError, InvalidIssueSummaryError, InvalidStoryPointsError */
	async editDetails(key: string, details: IssueDetails): Promise<void> {
		const changes = this.detailChanges(requireIssue(this.issues, key), details);
		if (hasChanges(changes)) await this.issues.update(key, changes);
	}

	/**
	 * The validated edit as the fields that actually differ from the stored issue (empty when none do).
	 * @throws InvalidIssueSummaryError, InvalidStoryPointsError
	 */
	detailChanges(issue: Issue, details: IssueDetails): IssueChanges {
		assertValidStoryPoints(details.points);
		const edited: IssueDetails = { ...details, summary: requireSummary(details.summary) };
		const differing = (Object.keys(edited) as (keyof IssueDetails)[]).filter((field) => edited[field] !== issue[field]);
		return Object.fromEntries(differing.map((field) => [field, edited[field]]));
	}

	/**
	 * The fields a move to `statusId` changes (empty when the issue already has that status).
	 * @throws UnknownStatusError
	 */
	statusChange(issue: Issue, statusId: string): IssueChanges {
		const changes = this.statusChanges(issue, statusId);
		return issue.status === statusId ? {} : changes;
	}

	/** @throws IssueNotFoundError, UnknownStatusError */
	async transition(key: string, statusId: string): Promise<void> {
		const issue = requireIssue(this.issues, key);
		await this.issues.update(key, this.statusChanges(issue, statusId));
	}

	/**
	 * Plans the issue into a sprint (or the backlog when null), directly before `beforeKey` or last.
	 * @throws IssueNotFoundError, SprintNotFoundError, SprintClosedError
	 */
	async move(key: string, sprintName: string | null, beforeKey: string | null): Promise<void> {
		requireIssue(this.issues, key);
		assertPlannable(this.sprints, sprintName);
		const placement = planPlacement(this.containerIssues(sprintName), key, beforeKey);
		await this.applyPlacement(key, placement, { sprint: sprintName });
	}

	/**
	 * Moves an active-sprint issue to a board column, directly before `beforeKey` or last.
	 * @throws IssueNotFoundError, UnknownStatusError, NoActiveSprintError, IssueNotInActiveSprintError
	 */
	async placeOnBoard(key: string, statusId: string, beforeKey: string | null): Promise<void> {
		const issue = requireIssue(this.issues, key);
		const statusChanges = this.statusChanges(issue, statusId);
		const board = buildBoard(this.issues.findAll(), this.sprints.findAll(), this.config.workflow);
		if (!board) throw new NoActiveSprintError();
		if (issue.sprint !== board.sprint.name) throw new IssueNotInActiveSprintError(key);
		const column = board.columns.find((c) => c.status.id === statusId)?.issues ?? [];
		await this.applyPlacement(key, planPlacement(column, key, beforeKey), statusChanges);
	}

	private statusChanges(issue: Issue, statusId: string): IssueChanges {
		const { workflow } = this.config;
		const status = workflow.require(statusId);
		const becomesDone = workflow.isDone(status.id);
		if (becomesDone && workflow.isDone(issue.status) && issue.resolved !== null) return { status: status.id };
		return { status: status.id, resolved: becomesDone ? this.clock.today() : null };
	}

	private async applyPlacement(key: string, placement: RankAssignment[], changes: IssueChanges): Promise<void> {
		const ownRank = placement.find((assignment) => assignment.key === key)?.rank;
		await this.issues.update(key, { ...changes, ...(ownRank === undefined ? {} : { rank: ownRank }) });
		for (const assignment of placement) {
			if (assignment.key !== key) await this.issues.update(assignment.key, { rank: assignment.rank });
		}
	}

	private containerIssues(sprintName: string | null): Issue[] {
		return issuesInContainer(this.issues.findAll(), this.sprints.findAll(), this.config.workflow, sprintName);
	}

	private nextFreeKey(): string {
		const keys = this.issues.findAll().map((issue) => issue.key);
		const [key] = nextFreeKeys(this.config.keyPrefix, keys, (candidate) => this.issues.exists(candidate), 1);
		if (key === undefined) throw new Error('No free issue key was found.');
		return key;
	}
}

export function hasChanges(changes: IssueChanges): boolean {
	return Object.keys(changes).length > 0;
}

/** @throws InvalidIssueSummaryError */
function requireSummary(summary: string): string {
	const trimmed = summary.trim();
	if (trimmed === '') throw new InvalidIssueSummaryError();
	return trimmed;
}
