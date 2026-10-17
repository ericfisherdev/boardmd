import { planStatusMigrations, StatusDefinition, Workflow } from '../domain/workflow';
import { IssueRepository } from './ports';

/** Persists the workflow definition. */
export interface WorkflowStore {
	readonly workflow: Workflow;
	saveStatuses(statuses: readonly StatusDefinition[]): Promise<void>;
}

export class WorkflowCommands {
	constructor(
		private readonly store: WorkflowStore,
		private readonly issues: IssueRepository,
	) {}

	/**
	 * Replaces the workflow and moves issues out of statuses that were renamed or removed.
	 * @param renames previous status id → new status id, for statuses whose id was edited.
	 * @returns how many issues changed status.
	 * @throws InvalidWorkflowError when the statuses are invalid; nothing changes in that case.
	 */
	async replace(statuses: readonly StatusDefinition[], renames: ReadonlyMap<string, string> = new Map()): Promise<number> {
		const next = new Workflow(statuses);
		const migrations = planStatusMigrations(this.store.workflow.statuses, next, renames);
		await this.store.saveStatuses(statuses);
		let moved = 0;
		for (const issue of this.issues.findAll()) {
			const target = migrations.get(issue.status);
			if (target === undefined) continue;
			await this.issues.update(issue.key, { status: target });
			moved++;
		}
		return moved;
	}
}
