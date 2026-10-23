/** Base class for every expected, user-facing failure in BoardMD. */
export abstract class BoardMdError extends Error {
	protected constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export class IssueNotFoundError extends BoardMdError {
	constructor(readonly key: string) {
		super(`Issue ${key} does not exist.`);
	}
}

export class InvalidIssueSummaryError extends BoardMdError {
	constructor() {
		super('An issue needs a summary.');
	}
}

export class InvalidStoryPointsError extends BoardMdError {
	constructor(readonly points: string) {
		super(`Story points must be a non-negative number, not "${points}".`);
	}
}

export class SelfLinkError extends BoardMdError {
	constructor(readonly key: string) {
		super(`${key} cannot be linked to itself.`);
	}
}

export class ParentCycleError extends BoardMdError {
	constructor(readonly key: string, readonly parentKey: string) {
		super(`${parentKey} cannot be the parent of ${key}: that would create a cycle.`);
	}
}

export class SprintNotFoundError extends BoardMdError {
	constructor(readonly sprintName: string) {
		super(`Sprint "${sprintName}" does not exist.`);
	}
}

export class InvalidSprintNameError extends BoardMdError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" is not a valid sprint name. Avoid empty names and the characters \\ / : * ? " < > | # ^ [ ].`);
	}
}

export class DuplicateSprintNameError extends BoardMdError {
	constructor(readonly sprintName: string) {
		super(`A sprint named "${sprintName}" already exists.`);
	}
}

export class SprintAlreadyActiveError extends BoardMdError {
	constructor(readonly activeSprintName: string) {
		super(`"${activeSprintName}" is already active. Complete it before starting another sprint.`);
	}
}

export class SprintNotFutureError extends BoardMdError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" has already been started.`);
	}
}

export class SprintNotActiveError extends BoardMdError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" is not the active sprint.`);
	}
}

export class SprintClosedError extends BoardMdError {
	constructor(readonly sprintName: string) {
		super(`"${sprintName}" is closed; issues cannot be moved into it.`);
	}
}

export class InvalidSprintDateError extends BoardMdError {
	constructor(readonly which: 'start' | 'end') {
		super(`Choose a ${which} date for the sprint.`);
	}
}

export class InvalidSprintScheduleError extends BoardMdError {
	constructor(readonly startDate: string, readonly endDate: string) {
		super(`Sprint end date ${endDate} must be on or after its start date ${startDate}.`);
	}
}

export class NoActiveSprintError extends BoardMdError {
	constructor() {
		super('There is no active sprint.');
	}
}

export class IssueNotInActiveSprintError extends BoardMdError {
	constructor(readonly key: string) {
		super(`${key} is not in the active sprint.`);
	}
}

export class UnknownStatusError extends BoardMdError {
	constructor(readonly statusId: string) {
		super(`"${statusId}" is not a status in the configured workflow.`);
	}
}

export class InvalidWorkflowError extends BoardMdError {
	constructor(readonly problems: readonly string[]) {
		super(`Invalid workflow: ${problems.join(' ')}`);
	}
}

export class InvalidProjectNameError extends BoardMdError {
	constructor(readonly projectName: string) {
		super(`"${projectName}" cannot be a project name. Use a name that works as a folder name, without leading dots or characters such as / \\ : * ? " < > | # ^ [ ].`);
	}
}

export class DuplicateProjectNameError extends BoardMdError {
	constructor(readonly projectName: string) {
		super(`A project named "${projectName}" already exists.`);
	}
}

export class UnknownProjectError extends BoardMdError {
	constructor(readonly projectName: string) {
		super(`There is no project named "${projectName}".`);
	}
}

export class InvalidKeyPrefixError extends BoardMdError {
	constructor(readonly prefix: string) {
		super(`The key prefix "${prefix}" must start with a letter and contain only capital letters and digits.`);
	}
}

export class DuplicateKeyPrefixError extends BoardMdError {
	constructor(readonly prefix: string, readonly projectName: string) {
		super(`The key prefix ${prefix} is already used by the project "${projectName}". Each project needs its own prefix so issue links stay unambiguous.`);
	}
}

export class InvalidSprintLengthError extends BoardMdError {
	constructor(readonly days: number) {
		super(`The sprint length must be a whole number of days, at least 1, not ${days}.`);
	}
}

export class InvalidRepositoryError extends BoardMdError {
	constructor(readonly input: string, reason: string) {
		super(`"${input}" is not a usable repository address: ${reason}`);
	}
}

export class NoRepositoryLinkedError extends BoardMdError {
	constructor(readonly projectName: string) {
		super(`The project "${projectName}" has no linked repository. Link one in the BoardMD settings first.`);
	}
}

export class RepositoryRequestError extends BoardMdError {
	constructor(readonly status: number | null, reason: string) {
		super(`Could not read issues from the repository: ${reason}`);
	}
}

export class RepositoryTooLargeError extends BoardMdError {
	constructor(readonly limit: number) {
		super(`The repository has more than ${limit} issues to pull at once. Turn off "Also import closed issues" or pull again later for the rest.`);
	}
}

export class PullInProgressError extends BoardMdError {
	constructor() {
		super('Issues are already being pulled.');
	}
}

export class PullInterruptedError extends BoardMdError {
	constructor(readonly projectName: string) {
		super(`Pulling stopped because the board switched away from the project "${projectName}". Pull again to finish.`);
	}
}

export class MissingTokenError extends BoardMdError {
	constructor(readonly secretId: string) {
		super(`The access token "${secretId}" is empty or was removed. Choose it again in the BoardMD settings.`);
	}
}
