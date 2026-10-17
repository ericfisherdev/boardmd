import { InvalidWorkflowError, UnknownStatusError } from './errors';

/** What a status means to sprint logic, independent of its user-facing name. */
export enum StatusCategory {
	ToDo = 'todo',
	InProgress = 'in-progress',
	Done = 'done',
}

export interface StatusDefinition {
	/** Value stored in an issue's `status` frontmatter field. */
	readonly id: string;
	/** Column heading and label shown in the UI. */
	readonly name: string;
	readonly category: StatusCategory;
}

const STATUS_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** An ordered, validated set of statuses; order defines the board's columns. */
export class Workflow {
	private readonly byId: ReadonlyMap<string, StatusDefinition>;

	/** @throws InvalidWorkflowError when the definitions break any rule in {@link findWorkflowProblems}. */
	constructor(readonly statuses: readonly StatusDefinition[]) {
		const problems = findWorkflowProblems(statuses);
		if (problems.length > 0) throw new InvalidWorkflowError(problems);
		this.byId = new Map(statuses.map((status) => [status.id, status]));
	}

	/** Status given to new issues: the first To Do status, else the first status. */
	get initialStatus(): StatusDefinition {
		const first = this.statuses.find((s) => s.category === StatusCategory.ToDo) ?? this.statuses[0];
		if (!first) throw new InvalidWorkflowError(['A workflow needs at least one status.']);
		return first;
	}

	find(statusId: string): StatusDefinition | null {
		return this.byId.get(statusId) ?? null;
	}

	/** @throws UnknownStatusError when the id is not part of this workflow. */
	require(statusId: string): StatusDefinition {
		const status = this.find(statusId);
		if (!status) throw new UnknownStatusError(statusId);
		return status;
	}

	/** Statuses no longer in the workflow are shown in, and treated as, the initial status. */
	resolve(statusId: string): StatusDefinition {
		return this.find(statusId) ?? this.initialStatus;
	}

	isDone(statusId: string): boolean {
		return this.resolve(statusId).category === StatusCategory.Done;
	}
}

export function findWorkflowProblems(statuses: readonly StatusDefinition[]): string[] {
	const problems: string[] = [];
	if (statuses.length === 0) problems.push('Add at least one status.');
	for (const status of statuses) {
		if (!STATUS_ID_PATTERN.test(status.id)) {
			problems.push(`Status id "${status.id}" must be lowercase letters, digits and single hyphens.`);
		}
		if (status.name.trim() === '') problems.push(`Status "${status.id}" needs a name.`);
	}
	const duplicateIds = findDuplicates(statuses.map((s) => s.id));
	if (duplicateIds.length > 0) problems.push(`Status ids must be unique: ${duplicateIds.join(', ')}.`);
	if (!statuses.some((s) => s.category === StatusCategory.Done)) {
		problems.push('At least one status must be in the Done category.');
	}
	return problems;
}

function findDuplicates(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return [...duplicates];
}

/** Turns a display name such as "Plan Created" into a status id such as "plan-created". */
export function statusIdFromName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export const SIMPLE_WORKFLOW: readonly StatusDefinition[] = [
	{ id: 'todo', name: 'To Do', category: StatusCategory.ToDo },
	{ id: 'in-progress', name: 'In Progress', category: StatusCategory.InProgress },
	{ id: 'done', name: 'Done', category: StatusCategory.Done },
];

export const EXTENDED_WORKFLOW: readonly StatusDefinition[] = [
	{ id: 'todo', name: 'To Do', category: StatusCategory.ToDo },
	{ id: 'blocked', name: 'Blocked', category: StatusCategory.ToDo },
	{ id: 'plan-created', name: 'Plan Created', category: StatusCategory.ToDo },
	{ id: 'in-progress', name: 'In Progress', category: StatusCategory.InProgress },
	{ id: 'in-review', name: 'In Review', category: StatusCategory.InProgress },
	{ id: 'done', name: 'Done', category: StatusCategory.Done },
];

/**
 * Where issues in statuses that disappear from the workflow should go. Explicit renames win;
 * otherwise a removed status maps to the first remaining status of the same category, else the
 * new initial status. Statuses that survive unchanged are not listed.
 */
export function planStatusMigrations(
	previous: readonly StatusDefinition[],
	next: Workflow,
	renames: ReadonlyMap<string, string>,
): Map<string, string> {
	const migrations = new Map<string, string>();
	for (const status of previous) {
		if (next.find(status.id) && !renames.has(status.id)) continue;
		const renamed = renames.get(status.id);
		const target = renamed !== undefined && next.find(renamed) ? renamed : sameCategoryOrInitial(status.category, next);
		if (target !== status.id) migrations.set(status.id, target);
	}
	return migrations;
}

function sameCategoryOrInitial(category: StatusCategory, workflow: Workflow): string {
	return (workflow.statuses.find((s) => s.category === category) ?? workflow.initialStatus).id;
}
