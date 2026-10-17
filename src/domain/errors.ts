/** Base class for every expected, user-facing failure in Obsidiboard. */
export abstract class ObsidiboardError extends Error {
	protected constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export class IssueNotFoundError extends ObsidiboardError {
	constructor(readonly key: string) {
		super(`Issue ${key} does not exist.`);
	}
}

export class InvalidIssueSummaryError extends ObsidiboardError {
	constructor() {
		super('An issue needs a summary.');
	}
}

export class InvalidStoryPointsError extends ObsidiboardError {
	constructor(readonly points: string) {
		super(`Story points must be a non-negative number, not "${points}".`);
	}
}

export class SelfLinkError extends ObsidiboardError {
	constructor(readonly key: string) {
		super(`${key} cannot be linked to itself.`);
	}
}

export class ParentCycleError extends ObsidiboardError {
	constructor(readonly key: string, readonly parentKey: string) {
		super(`${parentKey} cannot be the parent of ${key}: that would create a cycle.`);
	}
}

export class SprintNotFoundError extends ObsidiboardError {
	constructor(readonly sprintName: string) {
		super(`Sprint "${sprintName}" does not exist.`);
	}
}

export class InvalidSprintNameError extends ObsidiboardError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" is not a valid sprint name. Avoid empty names and the characters \\ / : * ? " < > | # ^ [ ].`);
	}
}

export class DuplicateSprintNameError extends ObsidiboardError {
	constructor(readonly sprintName: string) {
		super(`A sprint named "${sprintName}" already exists.`);
	}
}

export class SprintAlreadyActiveError extends ObsidiboardError {
	constructor(readonly activeSprintName: string) {
		super(`"${activeSprintName}" is already active. Complete it before starting another sprint.`);
	}
}

export class SprintNotFutureError extends ObsidiboardError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" has already been started.`);
	}
}

export class SprintNotActiveError extends ObsidiboardError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" is not the active sprint.`);
	}
}

export class SprintClosedError extends ObsidiboardError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" is closed; issues cannot be moved into it.`);
	}
}

export class InvalidSprintDateError extends ObsidiboardError {
	constructor(readonly which: 'start' | 'end') {
		super(`Choose a ${which} date for the sprint.`);
	}
}

export class InvalidSprintScheduleError extends ObsidiboardError {
	constructor(readonly startDate: string, readonly endDate: string) {
		super(`Sprint end date ${endDate} must be on or after its start date ${startDate}.`);
	}
}

export class NoActiveSprintError extends ObsidiboardError {
	constructor() {
		super('There is no active sprint.');
	}
}

export class IssueNotInActiveSprintError extends ObsidiboardError {
	constructor(readonly key: string) {
		super(`${key} is not in the active sprint.`);
	}
}

export class UnknownStatusError extends ObsidiboardError {
	constructor(readonly statusId: string) {
		super(`"${statusId}" is not a status in the configured workflow.`);
	}
}

export class InvalidWorkflowError extends ObsidiboardError {
	constructor(readonly problems: readonly string[]) {
		super(`Invalid workflow: ${problems.join(' ')}`);
	}
}

export class InvalidProjectNameError extends ObsidiboardError {
	constructor(readonly projectName: string) {
		super(`"${projectName}" cannot be a project name. Use a name that works as a folder name, without leading dots or characters such as / \\ : * ? " < > | # ^ [ ].`);
	}
}

export class DuplicateProjectNameError extends ObsidiboardError {
	constructor(readonly projectName: string) {
		super(`A project named "${projectName}" already exists.`);
	}
}

export class UnknownProjectError extends ObsidiboardError {
	constructor(readonly projectName: string) {
		super(`There is no project named "${projectName}".`);
	}
}

export class InvalidKeyPrefixError extends ObsidiboardError {
	constructor(readonly prefix: string) {
		super(`The key prefix "${prefix}" must start with a letter and contain only capital letters and digits.`);
	}
}

export class DuplicateKeyPrefixError extends ObsidiboardError {
	constructor(readonly prefix: string, readonly projectName: string) {
		super(`The key prefix ${prefix} is already used by the project "${projectName}". Each project needs its own prefix so issue links stay unambiguous.`);
	}
}

export class InvalidSprintLengthError extends ObsidiboardError {
	constructor(readonly days: number) {
		super(`The sprint length must be a whole number of days, at least 1, not ${days}.`);
	}
}

export class InvalidRepositoryError extends ObsidiboardError {
	constructor(readonly input: string, reason: string) {
		super(`"${input}" is not a usable repository address: ${reason}`);
	}
}

export class NoRepositoryLinkedError extends ObsidiboardError {
	constructor(readonly projectName: string) {
		super(`The project "${projectName}" has no linked repository. Link one in the Obsidiboard settings first.`);
	}
}

export class RepositoryRequestError extends ObsidiboardError {
	constructor(readonly status: number | null, reason: string) {
		super(`Could not read issues from the repository: ${reason}`);
	}
}

export class RepositoryTooLargeError extends ObsidiboardError {
	constructor(readonly limit: number) {
		super(`The repository has more than ${limit} issues to pull at once. Turn off "Also import closed issues" or pull again later for the rest.`);
	}
}

export class PullInProgressError extends ObsidiboardError {
	constructor() {
		super('Issues are already being pulled.');
	}
}

export class PullInterruptedError extends ObsidiboardError {
	constructor(readonly projectName: string) {
		super(`Pulling stopped because the board switched away from the project "${projectName}". Pull again to finish.`);
	}
}

export class MissingTokenError extends ObsidiboardError {
	constructor(readonly secretId: string) {
		super(`The access token "${secretId}" is empty or was removed. Choose it again in the Obsidiboard settings.`);
	}
}
