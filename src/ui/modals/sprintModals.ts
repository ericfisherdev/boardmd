import { App, Setting } from 'obsidian';
import { SprintPlan } from '../../application/SprintCommands';
import { Choice } from './ChoiceModal';
import { FormModal } from './FormModal';

export class SprintNameModal extends FormModal {
	private name: string;

	constructor(
		app: App,
		suggestedName: string,
		private readonly onSubmitName: (name: string) => Promise<void>,
	) {
		super(app, 'Create sprint', 'Create');
		this.name = suggestedName;
	}

	protected renderFields(container: HTMLElement): void {
		new Setting(container).setName('Name').addText((text) => {
			text.setValue(this.name).onChange((value) => (this.name = value));
			this.submitOnEnter(text.inputEl);
			window.setTimeout(() => text.inputEl.select(), 0);
		});
	}

	protected async onSubmit(): Promise<void> {
		await this.onSubmitName(this.name.trim());
	}
}

export class StartSprintModal extends FormModal {
	private readonly plan: { -readonly [K in keyof SprintPlan]: SprintPlan[K] };

	constructor(
		app: App,
		sprintName: string,
		suggested: SprintPlan,
		private readonly onStart: (plan: SprintPlan) => Promise<void>,
	) {
		super(app, `Start ${sprintName}`, 'Start sprint');
		this.plan = { ...suggested };
	}

	protected renderFields(container: HTMLElement): void {
		this.dateField(container, 'Start date', this.plan.startDate, (value) => (this.plan.startDate = value));
		this.dateField(container, 'End date', this.plan.endDate, (value) => (this.plan.endDate = value));
		new Setting(container).setName('Sprint goal').addTextArea((area) => {
			area.setValue(this.plan.goal).onChange((value) => (this.plan.goal = value));
			area.inputEl.rows = 3;
			area.inputEl.addClass('boardmd-wide-input');
		});
	}

	private dateField(container: HTMLElement, name: string, value: string, onChange: (value: string) => void): void {
		new Setting(container).setName(name).addText((text) => {
			text.inputEl.type = 'date';
			text.setValue(value).onChange(onChange);
		});
	}

	protected async onSubmit(): Promise<void> {
		await this.onStart(this.plan);
	}
}

export interface CompleteSprintSummary {
	readonly sprintName: string;
	readonly completedCount: number;
	readonly unfinishedCount: number;
	readonly destinations: readonly Choice<string | null>[];
}

const BACKLOG_OPTION = '';

export class CompleteSprintModal extends FormModal {
	private destination: string | null = null;

	constructor(
		app: App,
		private readonly summary: CompleteSprintSummary,
		private readonly onComplete: (destination: string | null) => Promise<void>,
	) {
		super(app, `Complete ${summary.sprintName}`, 'Complete sprint');
	}

	protected renderFields(container: HTMLElement): void {
		const { completedCount, unfinishedCount } = this.summary;
		container.createEl('p', {
			text: `${completedCount} completed, ${unfinishedCount} unfinished. Completed issues stay with this sprint as its history.`,
		});
		if (unfinishedCount === 0) return;
		new Setting(container).setName('Move unfinished issues to').addDropdown((dropdown) => {
			for (const choice of this.summary.destinations) dropdown.addOption(choice.value ?? BACKLOG_OPTION, choice.label);
			dropdown.setValue(BACKLOG_OPTION).onChange((value) => (this.destination = value === BACKLOG_OPTION ? null : value));
		});
	}

	protected async onSubmit(): Promise<void> {
		await this.onComplete(this.destination);
	}
}
