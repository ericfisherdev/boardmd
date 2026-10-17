import { Issue } from './issue';
import { byRank } from './ranking';
import { bySequence, Sprint, SprintState } from './sprint';
import { StatusDefinition, Workflow } from './workflow';

export interface SprintSection {
	readonly sprint: Sprint;
	readonly issues: readonly Issue[];
}

export interface BacklogModel {
	readonly activeSprint: SprintSection | null;
	readonly plannedSprints: readonly SprintSection[];
	readonly backlog: readonly Issue[];
}

export interface BoardColumn {
	readonly status: StatusDefinition;
	readonly issues: readonly Issue[];
}

export interface BoardModel {
	readonly sprint: Sprint;
	readonly columns: readonly BoardColumn[];
}

export function findActiveSprint(sprints: readonly Sprint[]): Sprint | null {
	return sprints.find((sprint) => sprint.state === SprintState.Active) ?? null;
}

export function plannedSprints(sprints: readonly Sprint[]): Sprint[] {
	return sprints.filter((sprint) => sprint.state === SprintState.Future).sort(bySequence);
}

/** Issues planned into the named sprint, in rank order. */
export function issuesInSprint(issues: readonly Issue[], sprintName: string): Issue[] {
	return issues.filter((issue) => issue.sprint === sprintName).sort(byRank);
}

/**
 * Backlog issues in rank order: unplanned issues, issues pointing at a sprint that no longer exists,
 * and unfinished issues left behind in a closed sprint.
 */
export function backlogIssues(issues: readonly Issue[], sprints: readonly Sprint[], workflow: Workflow): Issue[] {
	const sprintsByName = new Map(sprints.map((sprint) => [sprint.name, sprint]));
	return issues.filter((issue) => isInBacklog(issue, sprintsByName, workflow)).sort(byRank);
}

function isInBacklog(issue: Issue, sprintsByName: ReadonlyMap<string, Sprint>, workflow: Workflow): boolean {
	if (issue.sprint === null) return true;
	const sprint = sprintsByName.get(issue.sprint);
	if (!sprint) return true;
	return sprint.state === SprintState.Closed && !workflow.isDone(issue.status);
}

/** Issues in the named container: a sprint by name, or the backlog when null. */
export function issuesInContainer(
	issues: readonly Issue[],
	sprints: readonly Sprint[],
	workflow: Workflow,
	sprintName: string | null,
): Issue[] {
	return sprintName === null ? backlogIssues(issues, sprints, workflow) : issuesInSprint(issues, sprintName);
}

export function buildBacklog(issues: readonly Issue[], sprints: readonly Sprint[], workflow: Workflow): BacklogModel {
	const active = findActiveSprint(sprints);
	return {
		activeSprint: active ? { sprint: active, issues: issuesInSprint(issues, active.name) } : null,
		plannedSprints: plannedSprints(sprints).map((sprint) => ({ sprint, issues: issuesInSprint(issues, sprint.name) })),
		backlog: backlogIssues(issues, sprints, workflow),
	};
}

export function buildBoard(issues: readonly Issue[], sprints: readonly Sprint[], workflow: Workflow): BoardModel | null {
	const sprint = findActiveSprint(sprints);
	if (!sprint) return null;
	const sprintIssues = issuesInSprint(issues, sprint.name);
	const columns = workflow.statuses.map((status) => ({
		status,
		issues: sprintIssues.filter((issue) => workflow.resolve(issue.status).id === status.id),
	}));
	return { sprint, columns };
}
