import { App, Notice, Plugin, PluginSettingTab, SecretComponent, Setting, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
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

/**
 * The plugin's settings, declared with Obsidian's setting definitions so they appear in settings search.
 * Every row renders itself, because most of them save on blur or through a command rather than per keystroke.
 */
export class BoardMdSettingTab extends PluginSettingTab {
	/**
	 * Unsaved edits survive re-renders of the tab. They are discarded when the tab closes, the
	 * project changes, or the edit is saved.
	 */
	private statusDraft: DraftStatus[] | null = null;
	private repositoryDraft: RepositoryDraft | null = null;

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
		// Obsidian keeps the built definitions while settings are closed, so changes made elsewhere
		// (for example switching project from the board) must rebuild them. While the tab is open,
		// its own actions rebuild it, and rebuilding on every save would take focus from the field.
		plugin.register(settings.onChange(() => this.refreshWhileClosed()));
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ type: 'group', items: this.generalSettings() },
			{ type: 'group', heading: 'Project', items: this.projectSettings() },
			{ type: 'group', heading: 'Repository', items: this.repositorySettings() },
			...this.workflowSettings(),
		];
	}

	hide(): void {
		super.hide();
		this.discardDrafts();
	}

	private refreshWhileClosed(): void {
		if (!this.containerEl.isShown()) this.update();
	}

	/** Drops every unsaved edit, for when the tab closes or now shows a different project. */
	private discardDrafts(): void {
		this.statusDraft = null;
		this.repositoryDraft = null;
		this.update();
	}

	private generalSettings(): SettingGroupItem[] {
		return [
			{
				name: 'Projects folder',
				desc: 'Each project is a subfolder of this folder, holding its own issues and sprints. Existing notes are not moved when it changes.',
				render: (setting) =>
					void setting.addText((text) => {
						text.setValue(this.settings.settings.projectsFolder);
						this.applyOnBlur(text.inputEl, (value) => this.settings.update({ projectsFolder: sanitizeFolder(value) }), () => this.settings.settings.projectsFolder);
					}),
			},
			{
				name: 'Write files for AI agents',
				desc: 'Keeps an index file and a data guide in each project folder so agents can read the board without parsing every note.',
				render: (setting) =>
					void setting.addToggle((toggle) =>
						toggle.setValue(this.settings.settings.writeAgentFiles).onChange((value) => runReporting(() => this.settings.update({ writeAgentFiles: value }))),
					),
			},
		];
	}

	/** Settings of the active project; the dropdown switches which project that is. */
	private projectSettings(): SettingGroupItem[] {
		return [
			{
				name: 'Active project',
				desc: 'The project the board shows. The settings below, including the workflow, belong to this project.',
				render: (setting) =>
					void setting
						.addDropdown((dropdown) => {
							for (const name of this.projects.names()) dropdown.addOption(name, name);
							dropdown.setValue(this.projects.activeProject).onChange((name) =>
								runReporting(async () => {
									await this.projects.switchTo(name);
									this.discardDrafts();
								}),
							);
						})
						.addButton((button) => button.setButtonText('New project').onClick(() => this.projectDialogs.create())),
			},
			{
				name: 'Issue key prefix',
				desc: 'Capital letters and digits, starting with a letter. Each project needs its own. Applies to new issues.',
				render: (setting) =>
					void setting.addText((text) => {
						text.setValue(this.settings.keyPrefix);
						this.applyOnBlur(text.inputEl, (value) => this.projects.changeKeyPrefix(value.trim().toUpperCase()), () => this.settings.keyPrefix);
					}),
			},
			{
				name: 'Default sprint length',
				desc: 'In days; used to suggest an end date when starting a sprint.',
				render: (setting) =>
					void setting.addText((text) => {
						text.inputEl.type = 'number';
						text.inputEl.min = '1';
						text.setValue(String(this.settings.sprintLengthDays));
						this.applyOnBlur(text.inputEl, (value) => this.projects.changeSprintLength(Number(value)), () => String(this.settings.sprintLengthDays));
					}),
			},
		];
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
	private repositorySettings(): SettingGroupItem[] {
		const linked = this.repositoryLink.current();
		const draft = this.currentRepositoryDraft();
		let urlInput: HTMLInputElement | null = null;
		return [
			{
				name: 'Service',
				desc: 'Pull issues from a GitHub or GitLab repository into this project. Pulling never sends anything back, and keeps your sprint, rank, points, priority, parent and links. The repository decides an issue\'s title, assignee and whether it is closed.',
				render: (setting) =>
					void setting.addDropdown((dropdown) =>
						dropdown
							.addOption(RepositoryProvider.GitHub, 'GitHub')
							.addOption(RepositoryProvider.GitLab, 'GitLab')
							.setValue(draft.provider)
							.onChange((value) => (draft.provider = value as RepositoryProvider)),
					),
			},
			{
				name: 'Repository address',
				desc: 'Copy it from the browser, for example github.com/owner/repo or gitlab.example.com/group/project.',
				render: (setting) =>
					void setting.addText((text) => {
						urlInput = text.inputEl;
						text.setPlaceholder('Paste the repository address').setValue(draft.url).onChange((value) => (draft.url = value));
						text.inputEl.addClass('boardmd-wide-input');
					}),
			},
			{
				name: 'Access token',
				desc: 'Needed for private repositories, and avoids low rate limits on public ones. Stored in Obsidian\'s secret storage, never in the plugin\'s settings file.',
				render: (setting) =>
					void setting.addComponent((el) =>
						new SecretComponent(this.app, el).setValue(draft.tokenSecretId ?? '').onChange((secretId) => (draft.tokenSecretId = secretId || null)),
					),
			},
			{
				name: 'Also import closed issues',
				desc: 'Issues already in the project are always kept in step with their open or closed state.',
				render: (setting) => void setting.addToggle((toggle) => toggle.setValue(draft.includeClosed).onChange((value) => (draft.includeClosed = value))),
			},
			{
				name: 'Render descriptions as Markdown',
				desc: 'Off is safer: descriptions are saved as plain text in a code block, so a repository cannot put scripts, embeds or HTML into your vault. Turn it on only for repositories you trust.',
				render: (setting) => void setting.addToggle((toggle) => toggle.setValue(draft.trustDescriptions).onChange((value) => (draft.trustDescriptions = value))),
			},
			{
				name: linked ? 'Linked repository' : 'Link repository',
				desc: linked ? `Linked to ${describeRepository(linked)}. ${linked.lastPulledAt ? `Last pulled ${linked.lastPulledAt}.` : 'Not pulled yet.'}` : '',
				render: (setting) => this.renderRepositoryActions(setting, linked !== null, () => ({ ...draft, provider: this.providerFor(draft, urlInput) })),
			},
		];
	}

	/** The repository form starts from the linked repository, or empty when none is linked. */
	private currentRepositoryDraft(): RepositoryDraft {
		const linked = this.repositoryLink.current();
		this.repositoryDraft ??= {
			provider: linked?.provider ?? RepositoryProvider.GitHub,
			url: linked ? `https://${linked.host}/${linked.path}` : '',
			tokenSecretId: linked?.tokenSecretId ?? null,
			includeClosed: linked?.includeClosed ?? false,
			trustDescriptions: linked?.trustDescriptions ?? false,
		};
		return this.repositoryDraft;
	}

	private renderRepositoryActions(setting: Setting, linked: boolean, submitted: () => RepositoryDraft): void {
		setting.addButton((button) =>
			button.setButtonText(linked ? 'Save repository' : 'Link repository').setCta().onClick(() =>
				runReporting(async () => {
					await this.repositoryLink.link(submitted());
					new Notice('Repository linked.');
					this.repositoryDraft = null;
					this.update();
				}),
			),
		);
		if (!linked) return;
		setting.addButton((button) => button.setButtonText('Pull issues now').onClick(() => this.pullAction.run()));
		setting.addButton((button) => {
			button.buttonEl.addClass('mod-warning');
			button.setButtonText('Unlink').onClick(() =>
				runReporting(async () => {
					await this.repositoryLink.unlink();
					this.repositoryDraft = null;
					this.update();
				}),
			);
		});
	}

	/** A recognisable host overrides the dropdown when the two disagree, since the address is what gets used. */
	private providerFor(draft: RepositoryDraft, urlInput: HTMLInputElement | null): RepositoryProvider {
		const host = hostOf(urlInput?.value ?? draft.url);
		return (host === null ? null : guessProvider(host)) ?? draft.provider;
	}

	private workflowSettings(): SettingDefinitionItem[] {
		const draft = this.workflowDraft();
		return [
			{
				type: 'group',
				heading: 'Workflow',
				items: [
					{
						name: 'Start from a preset',
						desc: 'Statuses become the columns of the sprint board, in this order. Each status has a category that tells sprints whether work in it is finished.',
						render: (setting) =>
							void setting
								.addButton((button) => button.setButtonText('To do, in progress, done').onClick(() => this.loadPreset(SIMPLE_WORKFLOW)))
								.addButton((button) => button.setButtonText('With blocked, plan created, in review').onClick(() => this.loadPreset(EXTENDED_WORKFLOW))),
					},
				],
			},
			{
				type: 'list',
				heading: 'Statuses',
				cls: 'boardmd-status-list',
				emptyState: 'No statuses. Add one or start from a preset.',
				items: draft.map((status) => this.statusRow(status)),
				onReorder: (oldIndex, newIndex) => this.moveStatus(oldIndex, newIndex),
				onDelete: (index) => {
					draft.splice(index, 1);
					this.update();
				},
				addItem: {
					name: 'Add status',
					action: () => {
						draft.push({ id: '', name: '', category: StatusCategory.InProgress });
						this.update();
					},
				},
			},
			{
				type: 'group',
				items: [
					{
						name: 'Save workflow',
						desc: 'Issues in a removed status move to the first remaining status of the same category, or else to the first to-do status.',
						render: (setting) => void setting.addButton((button) => button.setButtonText('Save workflow').setCta().onClick(() => runReporting(() => this.saveWorkflow()))),
					},
				],
			},
		];
	}

	private workflowDraft(): DraftStatus[] {
		this.statusDraft ??= this.settings.workflow.statuses.map((status) => ({ ...status }));
		return this.statusDraft;
	}

	/**
	 * One status row. Its name field is the label, so the row has no separate name. Indexes are read
	 * when a button is pressed, since dragging can reorder rows after they are built.
	 */
	private statusRow(status: DraftStatus): SettingGroupItem {
		return {
			name: '',
			searchable: false,
			render: (setting) =>
				void setting
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
						button
							.setIcon('arrow-up')
							.setTooltip('Move up')
							.setDisabled(this.workflowDraft().indexOf(status) === 0)
							.onClick(() => this.shiftStatus(status, -1)),
					)
					.addExtraButton((button) =>
						button
							.setIcon('arrow-down')
							.setTooltip('Move down')
							.setDisabled(this.workflowDraft().indexOf(status) === this.workflowDraft().length - 1)
							.onClick(() => this.shiftStatus(status, 1)),
					),
		};
	}

	private loadPreset(preset: readonly StatusDefinition[]): void {
		this.statusDraft = preset.map((status) => ({ ...status }));
		this.update();
	}

	/** Keyboard-friendly alternative to dragging a row. */
	private shiftStatus(status: DraftStatus, offset: number): void {
		const index = this.workflowDraft().indexOf(status);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= this.workflowDraft().length) return;
		this.moveStatus(index, target);
		this.update();
	}

	private moveStatus(from: number, to: number): void {
		const draft = this.workflowDraft();
		const [moved] = draft.splice(from, 1);
		if (moved) draft.splice(to, 0, moved);
	}

	/**
	 * @throws InvalidWorkflowError when the draft breaks a workflow rule; the saved workflow is unchanged.
	 */
	private async saveWorkflow(): Promise<void> {
		const moved = await this.workflowCommands.replace(this.withIds(this.workflowDraft()));
		new Notice(moved > 0 ? `Workflow saved. ${moved} issues moved to a different status.` : 'Workflow saved.');
		this.statusDraft = null;
		this.update();
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
