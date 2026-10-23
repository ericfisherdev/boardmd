import { App, Setting } from 'obsidian';
import { IssueLinkKind, IssueLinks, IssuePriority, IssueType, ISSUE_LINK_KINDS, parseStoryPoints } from '../../domain/issue';
import { IssueOption, IssuePicker } from '../components/IssuePicker';
import { ISSUE_TYPE_PRESENTATION, LINK_KIND_HEADING, presentationOptions, PRIORITY_PRESENTATION } from '../labels';
import { BoardMdError } from '../../domain/errors';
import { reportError } from '../reportError';
import { AutoSaver, AutoSaveState } from './AutoSaver';
import { Choice } from './ChoiceModal';
import { FormModal } from './FormModal';

export enum IssueFormMode {
	/** A new issue: planned into a sprint, with a description. */
	Create = 'create',
	/** An existing issue: status and links are editable. */
	Edit = 'edit',
}

export interface IssueFormValues {
	summary: string;
	type: IssueType;
	priority: IssuePriority;
	points: number | null;
	assignee: string | null;
	status: string;
	sprint: string | null;
	parent: string | null;
	links: IssueLinks;
	description: string;
}

export interface IssueFormOptions {
	readonly mode: IssueFormMode;
	readonly title: string;
	readonly submitLabel: string;
	readonly initial: IssueFormValues;
	readonly statusChoices: readonly Choice<string>[];
	readonly sprintChoices: readonly Choice<string | null>[];
	/** Issues that can be chosen as parent or link target (never the issue being edited). */
	readonly issueOptions: readonly IssueOption[];
	readonly onSubmit: (values: IssueFormValues) => Promise<void>;
	/** Edit mode only: resolves once a save is visible to the next one. */
	readonly settled?: () => Promise<void>;
}

const BACKLOG_OPTION = '';
const AUTOSAVE_DELAY_MS = 600;

const AUTOSAVE_MESSAGE: Record<Exclude<AutoSaveState, AutoSaveState.Failed>, string> = {
	[AutoSaveState.Idle]: 'Changes save automatically.',
	[AutoSaveState.Pending]: 'Unsaved changes…',
	[AutoSaveState.Saving]: 'Saving…',
	[AutoSaveState.Saved]: 'All changes saved.',
};

export class IssueFormModal extends FormModal {
	private readonly values: IssueFormValues;
	private readonly links: Record<IssueLinkKind, string[]>;
	private pointsText: string;
	private readonly autoSaver: AutoSaver | null;
	private saveStatusEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly options: IssueFormOptions,
	) {
		super(app, options.title, options.submitLabel);
		this.values = { ...options.initial };
		this.links = cloneLinks(options.initial.links);
		this.pointsText = options.initial.points === null ? '' : String(options.initial.points);
		this.autoSaver =
			options.mode === IssueFormMode.Edit
				? new AutoSaver({
						save: () => options.onSubmit(this.currentValues()),
						settled: options.settled ?? (() => Promise.resolve()),
						delayMs: AUTOSAVE_DELAY_MS,
						onStateChange: (state, error) => this.showSaveState(state, error),
					})
				: null;
	}

	onClose(): void {
		this.autoSaver?.flush().catch(reportError);
		super.onClose();
	}

	protected renderFields(container: HTMLElement): void {
		if (this.options.mode === IssueFormMode.Create) this.renderCreateForm(container);
		else this.renderEditForm(container);
	}

	private renderEditForm(container: HTMLElement): void {
		this.renderSummaryField(container);
		this.renderTypeField(container);
		this.renderPriorityField(container);
		this.renderPointsField(container);
		this.renderAssigneeField(container);
		this.renderStatusField(container);
		this.renderParentField(container);
		this.renderLinkFields(container);
		this.renderSaveStatus(container);
	}

	/** Describe the work first, then optional details, then where it goes. */
	private renderCreateForm(container: HTMLElement): void {
		container.createEl('p', { cls: 'boardmd-form-intro', text: 'Describe the work. Only the summary is required; everything else can be changed later.' });
		this.renderSummaryField(container);
		this.renderDescriptionField(container);
		new Setting(container).setName('Details').setHeading();
		this.renderTypeField(container);
		this.renderPriorityField(container);
		this.renderPointsField(container);
		this.renderAssigneeField(container);
		new Setting(container).setName('Planning').setHeading();
		this.renderSprintField(container);
		this.renderParentField(container);
		this.updateSubmitState();
	}

	private updateSubmitState(): void {
		if (this.options.mode === IssueFormMode.Create) this.setSubmitEnabled(this.values.summary.trim() !== '');
	}

	private renderSummaryField(container: HTMLElement): void {
		const isCreate = this.options.mode === IssueFormMode.Create;
		const setting = new Setting(container).setName('Summary');
		if (isCreate) setting.setDesc('Required. A short title that says what the work is.');
		setting.addText((text) => {
			text.setPlaceholder('What needs to be done?').setValue(this.values.summary).onChange((value) =>
				this.edit(() => {
					this.values.summary = value;
					this.updateSubmitState();
				}),
			);
			text.inputEl.addClass('boardmd-wide-input');
			this.submitOnEnter(text.inputEl);
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
	}

	private renderDescriptionField(container: HTMLElement): void {
		new Setting(container)
			.setName('Description')
			.setDesc('Optional. Becomes the body of the issue note, so you can use Markdown.')
			.addTextArea((area) => {
				area.setValue(this.values.description).onChange((value) => (this.values.description = value));
				area.inputEl.rows = 5;
				area.inputEl.addClass('boardmd-wide-input');
			});
	}

	private renderTypeField(container: HTMLElement): void {
		const setting = new Setting(container).setName('Type');
		if (this.options.mode === IssueFormMode.Create) setting.setDesc('Story: a feature. Task: a piece of work. Bug: something broken. Epic: a large goal that groups other issues.');
		setting.addDropdown((dropdown) =>
			dropdown
				.addOptions(presentationOptions(ISSUE_TYPE_PRESENTATION))
				.setValue(this.values.type)
				.onChange((value) => this.edit(() => (this.values.type = value as IssueType))),
		);
	}

	private renderPriorityField(container: HTMLElement): void {
		new Setting(container).setName('Priority').addDropdown((dropdown) =>
			dropdown
				.addOptions(presentationOptions(PRIORITY_PRESENTATION))
				.setValue(this.values.priority)
				.onChange((value) => this.edit(() => (this.values.priority = value as IssuePriority))),
		);
	}

	private renderPointsField(container: HTMLElement): void {
		const setting = new Setting(container).setName('Story points');
		if (this.options.mode === IssueFormMode.Create) setting.setDesc('Optional estimate of effort. Leave blank if unsure.');
		setting.addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.min = '0';
			text.setValue(this.pointsText).onChange((value) => this.edit(() => (this.pointsText = value)));
		});
	}

	private renderAssigneeField(container: HTMLElement): void {
		const setting = new Setting(container).setName('Assignee');
		if (this.options.mode === IssueFormMode.Create) setting.setDesc('Optional. Who will do the work.');
		setting.addText((text) =>
			text.setValue(this.values.assignee ?? '').onChange((value) => this.edit(() => (this.values.assignee = value.trim() || null))),
		);
	}

	private renderStatusField(container: HTMLElement): void {
		new Setting(container).setName('Status').addDropdown((dropdown) => {
			for (const choice of this.options.statusChoices) dropdown.addOption(choice.value, choice.label);
			dropdown.setValue(this.values.status).onChange((value) => this.edit(() => (this.values.status = value)));
		});
	}

	private renderParentField(container: HTMLElement): void {
		const setting = new Setting(container).setName('Parent').setDesc('Optional. Group this issue under another one, usually an epic.');
		new IssuePicker(this.app, setting.controlEl, {
			candidates: this.options.issueOptions,
			initial: this.values.parent === null ? [] : [this.values.parent],
			allowMultiple: false,
			placeholder: 'Search issues',
			preferEpics: true,
			onChange: (keys) => this.edit(() => (this.values.parent = keys[0] ?? null)),
		});
	}

	private renderLinkFields(container: HTMLElement): void {
		new Setting(container).setName('Links').setHeading();
		for (const kind of ISSUE_LINK_KINDS) {
			const setting = new Setting(container).setName(LINK_KIND_HEADING[kind]);
			new IssuePicker(this.app, setting.controlEl, {
				candidates: this.options.issueOptions,
				initial: this.links[kind],
				allowMultiple: true,
				placeholder: 'Search issues',
				onChange: (keys) => this.edit(() => (this.links[kind] = keys)),
			});
		}
	}

	private renderSprintField(container: HTMLElement): void {
		new Setting(container)
			.setName('Sprint')
			.setDesc('Where the issue starts: the backlog, or a sprint to work on now or later.')
			.addDropdown((dropdown) => {
				for (const choice of this.options.sprintChoices) dropdown.addOption(choice.value ?? BACKLOG_OPTION, choice.label);
				dropdown
					.setValue(this.values.sprint ?? BACKLOG_OPTION)
					.onChange((value) => (this.values.sprint = value === BACKLOG_OPTION ? null : value));
			});
	}

	/** Edit mode: saves anything still pending, then the modal closes. Create mode: creates the issue. */
	protected async onSubmit(): Promise<void> {
		if (this.autoSaver) await this.autoSaver.flush();
		else await this.options.onSubmit(this.currentValues());
	}

	private currentValues(): IssueFormValues {
		return { ...this.values, points: parseStoryPoints(this.pointsText), links: cloneLinks(this.links) };
	}

	/** Applies a form edit and, when editing an existing issue, queues an automatic save. */
	private edit(apply: () => void): void {
		apply();
		this.autoSaver?.schedule();
	}

	private renderSaveStatus(container: HTMLElement): void {
		this.saveStatusEl = container.createDiv({ cls: 'boardmd-save-status', attr: { role: 'status', 'aria-live': 'polite' } });
		this.showSaveState(AutoSaveState.Idle, null);
	}

	private showSaveState(state: AutoSaveState, error: unknown): void {
		if (state !== AutoSaveState.Failed) return this.saveStatusEl?.setText(AUTOSAVE_MESSAGE[state]);
		if (error instanceof BoardMdError) this.saveStatusEl?.setText(`Not saved: ${error.message}`);
		else {
			this.saveStatusEl?.setText('Not saved. See the developer console for details.');
			reportError(error);
		}
	}
}

function cloneLinks(links: IssueLinks): Record<IssueLinkKind, string[]> {
	return Object.fromEntries(ISSUE_LINK_KINDS.map((kind) => [kind, [...links[kind]]])) as Record<IssueLinkKind, string[]>;
}
