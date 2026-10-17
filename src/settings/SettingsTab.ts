import { App, Notice, Plugin, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import { ProjectCommands } from '../application/ProjectCommands';
import { RepositoryLinkCommands } from '../application/RepositoryLinkCommands';
import { WorkflowCommands } from '../application/WorkflowCommands';
import {
	EXTENDED_WORKFLOW,
	SIMPLE_WORKFLOW,
	StatusCategory,
	StatusDefinition,
	statusIdFromName,
} from '../domain/workflow';
import { describeRepository, guessProvider, RepositoryProvider } from '../domain/repository';
import { IssuePullAction } from '../ui/IssuePullAction';
import { STATUS_CATEGORY_LABEL } from '../ui/labels';
import { ProjectDialogs } from '../ui/ProjectDialogs';
import { reportError, runReporting } from '../ui/reportError';
import { sanitizeFolder, SettingsStore } from './settings';

/** The repository form as the user is editing it. */
interface RepositoryDraft {
	provider: RepositoryProvider;
	url: string;
	tokenSecretId: string | null;
	includeClosed: boolean;
	trustDescriptions: boolean;
}

function hostOf(address: string): string | null {
	try {
		return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`).host.toLowerCase();
	} catch {
		return null;
	}
}

/** A status being edited; `id` is empty until a new status is saved. */
interface DraftStatus {
	id: string;
	name: string;
	category: StatusCategory;
}

export class ObsidiboardSettingTab extends PluginSettingTab {
	private draft: DraftStatus[] = [];

	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: SettingsStore,
		private readonly workflowCommands: WorkflowCommands,
		private readonly projects: ProjectCommands,
		private readonly projectDialogs: ProjectDialogs,
		private readonly repositoryLink: RepositoryLinkCommands,
		private readonly pullAction: IssuePullAction,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.draft = this.settings.workflow.statuses.map((status) => ({ ...status }));
		this.renderGeneral(containerEl);
		this.renderProject(containerEl);
		this.renderRepository(containerEl);
		this.renderWorkflow(containerEl);
	}

	private renderGeneral(container: HTMLElement): void {
		const { settings } = this.settings;
		new Setting(container)
			.setName('Projects folder')
			.setDesc('Each project is a subfolder of this folder, holding its own issues and sprints. Existing notes are not moved when it changes.')
			.addText((text) => {
				text.setValue(settings.projectsFolder);
				this.applyOnBlur(text.inputEl, (value) => this.settings.update({ projectsFolder: sanitizeFolder(value) }), () => this.settings.settings.projectsFolder);
			});
		new Setting(container)
			.setName('Write files for AI agents')
			.setDesc('Keeps an index file and a data guide in each project folder so agents can read the board without parsing every note.')
			.addToggle((toggle) =>
				toggle.setValue(settings.writeAgentFiles).onChange((value) => runReporting(() => this.settings.update({ writeAgentFiles: value }))),
			);
	}

	/** Settings of the active project; the dropdown switches which project that is. */
	private renderProject(container: HTMLElement): void {
		new Setting(container).setName('Project').setHeading();
		new Setting(container)
			.setName('Active project')
			.setDesc('The project the board shows. The settings below, including the workflow, belong to this project.')
			.addDropdown((dropdown) => {
				for (const name of this.projects.names()) dropdown.addOption(name, name);
				dropdown.setValue(this.projects.activeProject).onChange((name) =>
					runReporting(async () => {
						await this.projects.switchTo(name);
						this.display();
					}),
				);
			})
			.addButton((button) => button.setButtonText('New project').onClick(() => this.projectDialogs.create()));
		new Setting(container)
			.setName('Issue key prefix')
			.setDesc('Capital letters and digits, starting with a letter. Each project needs its own. Applies to new issues.')
			.addText((text) => {
				text.setValue(this.settings.keyPrefix);
				this.applyOnBlur(text.inputEl, (value) => this.projects.changeKeyPrefix(value.trim().toUpperCase()), () => this.settings.keyPrefix);
			});
		new Setting(container)
			.setName('Default sprint length')
			.setDesc('In days; used to suggest an end date when starting a sprint.')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.setValue(String(this.settings.sprintLengthDays));
				this.applyOnBlur(text.inputEl, (value) => this.projects.changeSprintLength(Number(value)), () => String(this.settings.sprintLengthDays));
			});
	}

	/** Runs the save when the field loses focus, then shows the stored value (which may have been corrected). */
	private applyOnBlur(input: HTMLInputElement, save: (value: string) => Promise<void>, stored: () => string): void {
		input.addEventListener('blur', () => {
			save(input.value)
				.catch(reportError)
				.finally(() => (input.value = stored()));
		});
	}

	/** Link to a GitHub or GitLab repository whose issues can be pulled into the active project. */
	private renderRepository(container: HTMLElement): void {
		const linked = this.repositoryLink.current();
		const draft: RepositoryDraft = {
			provider: linked?.provider ?? RepositoryProvider.GitHub,
			url: linked ? `https://${linked.host}/${linked.path}` : '',
			tokenSecretId: linked?.tokenSecretId ?? null,
			includeClosed: linked?.includeClosed ?? false,
			trustDescriptions: linked?.trustDescriptions ?? false,
		};
		new Setting(container).setName('Repository').setHeading();
		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Pull issues from a GitHub or GitLab repository into this project. Pulling never sends anything back, and keeps your sprint, rank, points, priority, parent and links. The repository decides an issue\'s title, assignee and whether it is closed.',
		});
		let urlInput: HTMLInputElement | null = null;
		new Setting(container)
			.setName('Service')
			.addDropdown((dropdown) =>
				dropdown
					.addOption(RepositoryProvider.GitHub, 'GitHub')
					.addOption(RepositoryProvider.GitLab, 'GitLab')
					.setValue(draft.provider)
					.onChange((value) => (draft.provider = value as RepositoryProvider)),
			);
		new Setting(container)
			.setName('Repository address')
			.setDesc('Copy it from the browser, for example github.com/owner/repo or gitlab.example.com/group/project.')
			.addText((text) => {
				urlInput = text.inputEl;
				text.setPlaceholder('Paste the repository address').setValue(draft.url).onChange((value) => (draft.url = value));
				text.inputEl.addClass('obsidiboard-wide-input');
			});
		new Setting(container)
			.setName('Access token')
			.setDesc('Needed for private repositories, and avoids low rate limits on public ones. Stored in Obsidian\'s secret storage, never in the plugin\'s settings file.')
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(draft.tokenSecretId ?? '').onChange((secretId) => (draft.tokenSecretId = secretId || null)),
			);
		new Setting(container)
			.setName('Also import closed issues')
			.setDesc('Issues already in the project are always kept in step with their open or closed state.')
			.addToggle((toggle) => toggle.setValue(draft.includeClosed).onChange((value) => (draft.includeClosed = value)));
		new Setting(container)
			.setName('Render descriptions as Markdown')
			.setDesc(
				'Off is safer: descriptions are saved as plain text in a code block, so a repository cannot put scripts, embeds or HTML into your vault. Turn it on only for repositories you trust.',
			)
			.addToggle((toggle) => toggle.setValue(draft.trustDescriptions).onChange((value) => (draft.trustDescriptions = value)));
		const actions = new Setting(container);
		actions.addButton((button) =>
			button.setButtonText(linked ? 'Save repository' : 'Link repository').setCta().onClick(() =>
				runReporting(async () => {
					await this.repositoryLink.link({ ...draft, provider: this.providerFor(draft, urlInput) });
					new Notice('Repository linked.');
					this.display();
				}),
			),
		);
		if (linked) {
			actions.addButton((button) => button.setButtonText('Pull issues now').onClick(() => this.pullAction.run()));
			actions.addButton((button) => {
				button.buttonEl.addClass('mod-warning');
				button.setButtonText('Unlink').onClick(() =>
					runReporting(async () => {
						await this.repositoryLink.unlink();
						this.display();
					}),
				);
			});
			actions.setDesc(`Linked to ${describeRepository(linked)}. ${linked.lastPulledAt ? `Last pulled ${linked.lastPulledAt}.` : 'Not pulled yet.'}`);
		}
	}

	/** A recognisable host overrides the dropdown when the two disagree, since the address is what gets used. */
	private providerFor(draft: RepositoryDraft, urlInput: HTMLInputElement | null): RepositoryProvider {
		const host = hostOf(urlInput?.value ?? draft.url);
		return (host === null ? null : guessProvider(host)) ?? draft.provider;
	}

	private renderWorkflow(container: HTMLElement): void {
		new Setting(container).setName('Workflow').setHeading();
		container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Statuses become the columns of the sprint board, in this order. Each status has a category that tells sprints whether work in it is finished.',
		});
		const presets = new Setting(container).setName('Start from a preset');
		presets.addButton((button) => button.setButtonText('To do, in progress, done').onClick(() => this.loadPreset(SIMPLE_WORKFLOW, list)));
		presets.addButton((button) => button.setButtonText('With blocked, plan created, in review').onClick(() => this.loadPreset(EXTENDED_WORKFLOW, list)));
		const list = container.createDiv({ cls: 'obsidiboard-status-list' });
		this.renderStatusList(list);
		new Setting(container)
			.addButton((button) =>
				button.setButtonText('Add status').onClick(() => {
					this.draft.push({ id: '', name: '', category: StatusCategory.InProgress });
					this.renderStatusList(list);
				}),
			)
			.addButton((button) => button.setButtonText('Save workflow').setCta().onClick(() => runReporting(() => this.saveWorkflow())));
	}

	private loadPreset(preset: readonly StatusDefinition[], list: HTMLElement): void {
		this.draft = preset.map((status) => ({ ...status }));
		this.renderStatusList(list);
	}

	private renderStatusList(list: HTMLElement): void {
		list.empty();
		this.draft.forEach((status, index) => {
			new Setting(list)
				.addText((text) => {
					text.setPlaceholder('Status name').setValue(status.name).onChange((value) => (status.name = value));
					text.inputEl.setAttribute('aria-label', 'Status name');
				})
				.addDropdown((dropdown) =>
					dropdown
						.addOptions(STATUS_CATEGORY_LABEL)
						.setValue(status.category)
						.onChange((value) => (status.category = value as StatusCategory)),
				)
				.addExtraButton((button) =>
					button.setIcon('arrow-up').setTooltip('Move up').setDisabled(index === 0).onClick(() => this.moveStatus(list, index, -1)),
				)
				.addExtraButton((button) =>
					button
						.setIcon('arrow-down')
						.setTooltip('Move down')
						.setDisabled(index === this.draft.length - 1)
						.onClick(() => this.moveStatus(list, index, 1)),
				)
				.addExtraButton((button) =>
					button.setIcon('trash').setTooltip('Remove status').onClick(() => {
						this.draft.splice(index, 1);
						this.renderStatusList(list);
					}),
				);
		});
	}

	private moveStatus(list: HTMLElement, index: number, offset: number): void {
		const target = index + offset;
		const moved = this.draft[index];
		const displaced = this.draft[target];
		if (!moved || !displaced) return;
		this.draft[index] = displaced;
		this.draft[target] = moved;
		this.renderStatusList(list);
	}

	/**
	 * @throws InvalidWorkflowError when the draft breaks a workflow rule; the saved workflow is unchanged.
	 */
	private async saveWorkflow(): Promise<void> {
		const moved = await this.workflowCommands.replace(this.withIds(this.draft));
		new Notice(moved > 0 ? `Workflow saved. ${moved} issues moved to a different status.` : 'Workflow saved.');
		this.display();
	}

	/** New statuses get an id derived from their name, made unique among the others. */
	private withIds(draft: readonly DraftStatus[]): StatusDefinition[] {
		const taken = new Set(draft.map((status) => status.id).filter((id) => id !== ''));
		return draft.map((status) => {
			const name = status.name.trim();
			if (status.id !== '') return { id: status.id, name, category: status.category };
			const base = statusIdFromName(name) || 'status';
			let id = base;
			for (let attempt = 2; taken.has(id); attempt++) id = `${base}-${attempt}`;
			taken.add(id);
			return { id, name, category: status.category };
		});
	}
}
