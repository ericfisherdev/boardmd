import { App, Setting } from 'obsidian';
import { FormModal } from './FormModal';

/** Asks for the name and issue key prefix of a new project. */
export class ProjectFormModal extends FormModal {
	private name = '';
	private prefix = '';
	private prefixEditedByUser = false;

	constructor(
		app: App,
		private readonly suggestPrefix: (projectName: string) => string,
		private readonly onCreate: (name: string, keyPrefix: string) => Promise<void>,
	) {
		super(app, 'Create project', 'Create');
	}

	protected renderFields(container: HTMLElement): void {
		let prefixInput: HTMLInputElement | null = null;
		new Setting(container)
			.setName('Name')
			.setDesc('Becomes a folder in the projects folder.')
			.addText((text) => {
				text.setPlaceholder('Project name').onChange((value) => {
					this.name = value;
					if (!this.prefixEditedByUser && prefixInput) prefixInput.value = this.prefix = this.suggestPrefix(value.trim());
				});
				this.submitOnEnter(text.inputEl);
				window.setTimeout(() => text.inputEl.focus(), 0);
			});
		new Setting(container)
			.setName('Issue key prefix')
			.setDesc('Letters and digits, starting with a letter. Each project needs its own, so issue links stay unambiguous.')
			.addText((text) => {
				prefixInput = text.inputEl;
				text.onChange((value) => {
					this.prefix = value.trim().toUpperCase();
					this.prefixEditedByUser = true;
				});
				this.submitOnEnter(text.inputEl);
			});
	}

	protected async onSubmit(): Promise<void> {
		await this.onCreate(this.name.trim(), this.prefix);
	}
}
