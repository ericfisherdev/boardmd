import { App } from 'obsidian';
import { BoardQueries } from '../application/BoardQueries';
import { SprintCommands } from '../application/SprintCommands';
import { issuesInSprint } from '../domain/boardModels';
import { CompleteSprintModal, SprintNameModal, StartSprintModal } from './modals/sprintModals';

/** Opens the forms that create, start and complete sprints. */
export class SprintDialogs {
	constructor(
		private readonly app: App,
		private readonly queries: BoardQueries,
		private readonly sprintCommands: SprintCommands,
	) {}

	create(): void {
		new SprintNameModal(this.app, this.sprintCommands.suggestName(), async (name) => {
			await this.sprintCommands.create(name);
		}).open();
	}

	start(name: string): void {
		new StartSprintModal(this.app, name, this.sprintCommands.suggestPlan(name), (plan) =>
			this.sprintCommands.start(name, plan),
		).open();
	}

	complete(name: string): void {
		const total = issuesInSprint(this.queries.allIssues(), name).length;
		const unfinished = this.sprintCommands.unfinishedIssues(name).length;
		const destinations = [
			{ label: 'Backlog', value: null },
			...this.queries.plannedSprints().map((sprint) => ({ label: sprint.name, value: sprint.name })),
		];
		new CompleteSprintModal(
			this.app,
			{ sprintName: name, completedCount: total - unfinished, unfinishedCount: unfinished, destinations },
			(destination) => this.sprintCommands.complete(name, destination),
		).open();
	}
}
