import { findActiveSprint, issuesInContainer, issuesInSprint } from '../domain/boardModels';
import { addDays, isCalendarDate } from '../domain/calendarDate';
import {
	DuplicateSprintNameError,
	InvalidSprintDateError,
	InvalidSprintScheduleError,
	SprintAlreadyActiveError,
	SprintNotActiveError,
	SprintNotFutureError,
} from '../domain/errors';
import { Issue, totalPoints } from '../domain/issue';
import { RANK_STEP, rankAfterLast } from '../domain/ranking';
import { assertValidSprintName, Sprint, SprintState } from '../domain/sprint';
import { requireSprint } from './lookups';
import { BoardConfig, Clock, IssueRepository, SprintRepository } from './ports';

export interface SprintPlan {
	readonly startDate: string;
	readonly endDate: string;
	readonly goal: string;
}

export class SprintCommands {
	constructor(
		private readonly sprints: SprintRepository,
		private readonly issues: IssueRepository,
		private readonly config: BoardConfig,
		private readonly clock: Clock,
	) {}

	/** First unused name of the form "Sprint N". */
	suggestName(): string {
		let sprintNumber = this.sprints.findAll().length + 1;
		while (this.sprints.findByName(`Sprint ${sprintNumber}`)) sprintNumber++;
		return `Sprint ${sprintNumber}`;
	}

	/** Starts today and lasts the configured sprint length. */
	suggestPlan(sprintName: string): SprintPlan {
		const startDate = this.clock.today();
		const goal = this.sprints.findByName(sprintName)?.goal ?? '';
		return { startDate, endDate: addDays(startDate, this.config.sprintLengthDays - 1), goal };
	}

	/** @throws InvalidSprintNameError, DuplicateSprintNameError */
	async create(name: string): Promise<Sprint> {
		assertValidSprintName(name);
		if (this.sprints.findByName(name)) throw new DuplicateSprintNameError(name);
		const sprint: Sprint = {
			name,
			state: SprintState.Future,
			sequence: Math.max(0, ...this.sprints.findAll().map((s) => s.sequence)) + 1,
			startDate: null,
			endDate: null,
			goal: '',
			committedPoints: null,
			outcome: null,
		};
		await this.sprints.create(sprint);
		return sprint;
	}

	/** @throws SprintNotFoundError, SprintNotFutureError, SprintAlreadyActiveError, InvalidSprintDateError, InvalidSprintScheduleError */
	async start(name: string, plan: SprintPlan): Promise<void> {
		const sprint = requireSprint(this.sprints, name);
		if (sprint.state !== SprintState.Future) throw new SprintNotFutureError(name);
		const active = findActiveSprint(this.sprints.findAll());
		if (active) throw new SprintAlreadyActiveError(active.name);
		assertCalendarDate('start', plan.startDate);
		assertCalendarDate('end', plan.endDate);
		if (plan.endDate < plan.startDate) throw new InvalidSprintScheduleError(plan.startDate, plan.endDate);
		await this.sprints.update(name, {
			state: SprintState.Active,
			startDate: plan.startDate,
			endDate: plan.endDate,
			goal: plan.goal.trim(),
			committedPoints: totalPoints(issuesInSprint(this.issues.findAll(), name)),
		});
	}

	/** Unfinished issues that completing the sprint would carry over, in rank order. */
	unfinishedIssues(name: string): Issue[] {
		return this.splitByCompletion(name).unfinished;
	}

	/**
	 * Closes the active sprint, records its outcome and carries unfinished issues to `destination`
	 * (a future sprint, or the backlog when null) after anything already there.
	 * @throws SprintNotFoundError, SprintNotActiveError, SprintNotFutureError
	 */
	async complete(name: string, destination: string | null): Promise<void> {
		const sprint = requireSprint(this.sprints, name);
		if (sprint.state !== SprintState.Active) throw new SprintNotActiveError(name);
		this.assertCarryOverDestination(destination);
		const { completed, unfinished } = this.splitByCompletion(name);
		await this.carryOver(unfinished, destination);
		await this.sprints.update(name, {
			state: SprintState.Closed,
			outcome: {
				completedIssues: completed.map((issue) => issue.key),
				carriedOverIssues: unfinished.map((issue) => issue.key),
				completedPoints: totalPoints(completed),
			},
		});
	}

	/** One read of the board, so an issue is counted on exactly one side. */
	private splitByCompletion(name: string): { completed: Issue[]; unfinished: Issue[] } {
		const sprintIssues = issuesInSprint(this.issues.findAll(), name);
		const isDone = (issue: Issue) => this.config.workflow.isDone(issue.status);
		return { completed: sprintIssues.filter(isDone), unfinished: sprintIssues.filter((issue) => !isDone(issue)) };
	}

	/** @throws SprintNotFoundError, SprintNotFutureError */
	private assertCarryOverDestination(destination: string | null): void {
		if (destination === null) return;
		if (requireSprint(this.sprints, destination).state !== SprintState.Future) {
			throw new SprintNotFutureError(destination);
		}
	}

	private async carryOver(unfinished: readonly Issue[], destination: string | null): Promise<void> {
		const existing = issuesInContainer(this.issues.findAll(), this.sprints.findAll(), this.config.workflow, destination);
		let rank = rankAfterLast(existing);
		for (const issue of unfinished) {
			await this.issues.update(issue.key, { sprint: destination, rank });
			rank += RANK_STEP;
		}
	}
}

/** @throws InvalidSprintDateError */
function assertCalendarDate(which: 'start' | 'end', value: string): void {
	if (!isCalendarDate(value)) throw new InvalidSprintDateError(which);
}
