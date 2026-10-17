import { App, FuzzySuggestModal } from 'obsidian';

export interface Choice<T> {
	readonly label: string;
	readonly value: T;
}

/** Fuzzy-searchable list of options; calls `onChoose` with the picked value. */
export class ChoiceModal<T> extends FuzzySuggestModal<Choice<T>> {
	constructor(
		app: App,
		placeholder: string,
		private readonly choices: readonly Choice<T>[],
		private readonly onChoose: (value: T) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): Choice<T>[] {
		return [...this.choices];
	}

	getItemText(choice: Choice<T>): string {
		return choice.label;
	}

	onChooseItem(choice: Choice<T>): void {
		this.onChoose(choice.value);
	}
}
