import { ProjectCommands } from '../../application/ProjectCommands';
import { ProjectDialogs } from '../ProjectDialogs';
import { runReporting } from '../reportError';

const NEW_PROJECT_OPTION = '\u0000new-project';

/** Toolbar dropdown that shows the active project and switches to another or creates one. */
export class ProjectSwitcher {
	private readonly select: HTMLSelectElement;

	constructor(
		parent: HTMLElement,
		private readonly projects: ProjectCommands,
		private readonly dialogs: ProjectDialogs,
	) {
		this.select = parent.createEl('select', { cls: 'dropdown boardmd-project-switcher', attr: { 'aria-label': 'Project' } });
		this.select.addEventListener('change', () => this.onChange());
		this.sync();
	}

	/** Brings the list and selection up to date, e.g. after the project changed elsewhere. */
	sync(): void {
		this.select.empty();
		for (const name of this.projects.names()) this.select.createEl('option', { value: name, text: name });
		this.select.createEl('option', { value: NEW_PROJECT_OPTION, text: 'New project…' });
		this.select.value = this.projects.activeProject;
	}

	private onChange(): void {
		const chosen = this.select.value;
		if (chosen === NEW_PROJECT_OPTION) {
			this.sync();
			this.dialogs.create();
			return;
		}
		runReporting(() => this.projects.switchTo(chosen));
	}
}
