import { AbstractInputSuggest, App, setIcon } from 'obsidian';
import { IssueType } from '../../domain/issue';

export interface IssueOption {
	readonly key: string;
	readonly summary: string;
	readonly type: IssueType;
}

export interface IssuePickerOptions {
	/** Issues that can be chosen. */
	readonly candidates: readonly IssueOption[];
	/** Keys selected when the picker opens. */
	readonly initial: readonly string[];
	/** When false, choosing an issue replaces the current one. */
	readonly allowMultiple: boolean;
	readonly placeholder: string;
	/** List epics before other issues in suggestions. */
	readonly preferEpics?: boolean;
	readonly onChange: (keys: string[]) => void;
}

const MAX_SUGGESTIONS = 30;

/** Chips for the chosen issues plus a type-ahead box that suggests existing issues. */
export class IssuePicker {
	private selected: string[];
	private readonly chipsEl: HTMLElement;

	constructor(
		app: App,
		container: HTMLElement,
		private readonly options: IssuePickerOptions,
	) {
		this.selected = [...options.initial];
		const root = container.createDiv({ cls: 'obsidiboard-picker' });
		this.chipsEl = root.createDiv({ cls: 'obsidiboard-chips' });
		const input = root.createEl('input', { type: 'text', attr: { placeholder: options.placeholder, 'aria-label': options.placeholder } });
		new IssueSuggest(app, input, () => this.suggestionPool(), options.preferEpics ?? false).onSelect((option) => {
			this.choose(option.key);
			input.value = '';
		});
		this.renderChips();
	}

	private suggestionPool(): IssueOption[] {
		return this.options.candidates.filter((candidate) => !this.selected.includes(candidate.key));
	}

	private choose(key: string): void {
		this.selected = this.options.allowMultiple ? [...this.selected, key] : [key];
		this.changed();
	}

	private remove(key: string): void {
		this.selected = this.selected.filter((selectedKey) => selectedKey !== key);
		this.changed();
	}

	private changed(): void {
		this.renderChips();
		this.options.onChange([...this.selected]);
	}

	private renderChips(): void {
		this.chipsEl.empty();
		for (const key of this.selected) {
			const option = this.options.candidates.find((candidate) => candidate.key === key);
			const chip = this.chipsEl.createDiv({ cls: 'obsidiboard-chip' });
			chip.createSpan({ cls: 'obsidiboard-key', text: key });
			if (option) chip.createSpan({ cls: 'obsidiboard-chip-summary', text: option.summary });
			const remove = chip.createEl('button', { cls: 'clickable-icon obsidiboard-chip-remove', attr: { type: 'button', 'aria-label': `Remove ${key}` } });
			setIcon(remove, 'x');
			remove.addEventListener('click', () => this.remove(key));
		}
	}
}

class IssueSuggest extends AbstractInputSuggest<IssueOption> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly pool: () => IssueOption[],
		private readonly preferEpics: boolean,
	) {
		super(app, inputEl);
		this.limit = MAX_SUGGESTIONS;
	}

	protected getSuggestions(query: string): IssueOption[] {
		const needle = query.trim().toLowerCase();
		const epicsFirst = (option: IssueOption) => (this.preferEpics && option.type === IssueType.Epic ? 0 : 1);
		return this.pool()
			.filter((option) => `${option.key} ${option.summary}`.toLowerCase().includes(needle))
			.sort((a, b) => epicsFirst(a) - epicsFirst(b) || a.key.localeCompare(b.key, undefined, { numeric: true }));
	}

	renderSuggestion(option: IssueOption, el: HTMLElement): void {
		el.createSpan({ cls: 'obsidiboard-key', text: option.key });
		el.createSpan({ text: ` ${option.summary}` });
	}

	selectSuggestion(option: IssueOption, evt: MouseEvent | KeyboardEvent): void {
		super.selectSuggestion(option, evt);
		this.close();
	}
}
