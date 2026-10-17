import { Sprint, SprintChanges, SprintOutcome, SprintState } from '../../domain/sprint';
import {
	Frontmatter,
	readDate,
	readEnum,
	readNoteReferences,
	readNumber,
	readString,
	toWikilink,
	writeField,
} from './values';

/** Frontmatter field names on sprint notes. */
export const SPRINT_FIELD = {
	state: 'state',
	sequence: 'sequence',
	startDate: 'start_date',
	endDate: 'end_date',
	goal: 'goal',
	committedPoints: 'committed_points',
	completedPoints: 'completed_points',
	completedIssues: 'completed_issues',
	carriedOverIssues: 'carried_over_issues',
} as const;

/** Reads a sprint note; the name comes from the note's file name. */
export function readSprint(name: string, frontmatter: Frontmatter): Sprint {
	return {
		name,
		state: readEnum(Object.values(SprintState), frontmatter[SPRINT_FIELD.state], SprintState.Future),
		sequence: readNumber(frontmatter[SPRINT_FIELD.sequence]) ?? Number.MAX_SAFE_INTEGER,
		startDate: readDate(frontmatter[SPRINT_FIELD.startDate]),
		endDate: readDate(frontmatter[SPRINT_FIELD.endDate]),
		goal: readString(frontmatter[SPRINT_FIELD.goal]) ?? '',
		committedPoints: readNumber(frontmatter[SPRINT_FIELD.committedPoints]),
		outcome: readOutcome(frontmatter),
	};
}

function readOutcome(frontmatter: Frontmatter): SprintOutcome | null {
	const completedPoints = readNumber(frontmatter[SPRINT_FIELD.completedPoints]);
	if (completedPoints === null) return null;
	return {
		completedIssues: readNoteReferences(frontmatter[SPRINT_FIELD.completedIssues]),
		carriedOverIssues: readNoteReferences(frontmatter[SPRINT_FIELD.carriedOverIssues]),
		completedPoints,
	};
}


/** Writes the changed fields into the frontmatter object in place. */
export function writeSprintChanges(frontmatter: Frontmatter, changes: SprintChanges): void {
	const fields: [string, unknown][] = [
		[SPRINT_FIELD.state, changes.state],
		[SPRINT_FIELD.sequence, changes.sequence],
		[SPRINT_FIELD.startDate, changes.startDate],
		[SPRINT_FIELD.endDate, changes.endDate],
		[SPRINT_FIELD.goal, changes.goal === '' ? null : changes.goal],
		[SPRINT_FIELD.committedPoints, changes.committedPoints],
	];
	for (const [field, value] of fields) {
		if (value !== undefined) writeField(frontmatter, field, value);
	}
	if (changes.outcome !== undefined) writeOutcome(frontmatter, changes.outcome);
}

function writeOutcome(frontmatter: Frontmatter, outcome: SprintOutcome | null): void {
	writeField(frontmatter, SPRINT_FIELD.completedPoints, outcome?.completedPoints ?? null);
	writeField(frontmatter, SPRINT_FIELD.completedIssues, outcome?.completedIssues.map(toWikilink) ?? null);
	writeField(frontmatter, SPRINT_FIELD.carriedOverIssues, outcome?.carriedOverIssues.map(toWikilink) ?? null);
}

/** Complete frontmatter for a new sprint note. */
export function sprintFrontmatter(sprint: Sprint): Frontmatter {
	const { name: _name, ...fields } = sprint;
	const frontmatter: Frontmatter = {};
	writeSprintChanges(frontmatter, fields);
	return frontmatter;
}
