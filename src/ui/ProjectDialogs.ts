import { App } from 'obsidian';
import { ProjectCommands } from '../application/ProjectCommands';
import { ChoiceModal } from './modals/ChoiceModal';
import { ProjectFormModal } from './modals/ProjectFormModal';
import { runReporting } from './reportError';

/** Opens the dialogs for creating and switching projects. */
export class ProjectDialogs {
	constructor(
		private readonly app: App,
		private readonly projects: ProjectCommands,
	) {}

	create(): void {
		new ProjectFormModal(
			this.app,
			(name) => this.projects.suggestKeyPrefix(name),
			(name, keyPrefix) => this.projects.create(name, keyPrefix),
		).open();
	}

	switchProject(): void {
		const choices = this.projects.names().map((name) => ({
			label: name === this.projects.activeProject ? `${name} (current)` : name,
			value: name,
		}));
		new ChoiceModal(this.app, 'Switch to project…', choices, (name) => runReporting(() => this.projects.switchTo(name))).open();
	}
}
