import { IssueNotFoundError, SprintClosedError, SprintNotFoundError } from '../domain/errors';
import { Issue } from '../domain/issue';
import { Sprint, SprintState } from '../domain/sprint';
import { IssueReader, SprintReader } from './ports';

/** @throws IssueNotFoundError */
export function requireIssue(issues: IssueReader, key: string): Issue {
	const issue = issues.findByKey(key);
	if (!issue) throw new IssueNotFoundError(key);
	return issue;
}

/** @throws SprintNotFoundError */
export function requireSprint(sprints: SprintReader, name: string): Sprint {
	const sprint = sprints.findByName(name);
	if (!sprint) throw new SprintNotFoundError(name);
	return sprint;
}

/**
 * Validates that issues may be planned into the sprint (null means the backlog).
 * @throws SprintNotFoundError, SprintClosedError
 */
export function assertPlannable(sprints: SprintReader, sprintName: string | null): void {
	if (sprintName === null) return;
	if (requireSprint(sprints, sprintName).state === SprintState.Closed) throw new SprintClosedError(sprintName);
}
