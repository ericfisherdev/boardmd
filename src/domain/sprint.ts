import { InvalidSprintNameError } from './errors';

export enum SprintState {
	Future = 'future',
	Active = 'active',
	Closed = 'closed',
}

/** Snapshot written onto a sprint note when it is completed, so history survives later moves. */
export interface SprintOutcome {
	readonly completedIssues: readonly string[];
	readonly carriedOverIssues: readonly string[];
	readonly completedPoints: number;
}

export interface Sprint {
	/** Unique name; also the sprint note's file name. */
	readonly name: string;
	readonly state: SprintState;
	/** Creation order, used to list planned sprints. */
	readonly sequence: number;
	readonly startDate: string | null;
	readonly endDate: string | null;
	readonly goal: string;
	/** Points in the sprint when it was started. */
	readonly committedPoints: number | null;
	readonly outcome: SprintOutcome | null;
}

export type SprintChanges = Partial<Omit<Sprint, 'name'>>;

const FORBIDDEN_NAME_CHARACTERS = /[\\/:*?"<>|#^[\]]/;

/** @throws InvalidSprintNameError when the name is blank or cannot be used as a note name and wikilink. */
export function assertValidSprintName(name: string): void {
	if (name.trim() === '' || name !== name.trim() || FORBIDDEN_NAME_CHARACTERS.test(name)) {
		throw new InvalidSprintNameError(name);
	}
}

export function bySequence(a: Sprint, b: Sprint): number {
	return a.sequence - b.sequence;
}
