import { App, MarkdownView, Plugin, TFile } from 'obsidian';
import { ChangeFeed } from '../application/ports';
import { isIssueKey } from '../domain/issueKey';
import { BoardLocations } from '../infrastructure/boardLocations';
import { IssueDialogs } from './IssueDialogs';

const HIDDEN_CLASS = 'boardmd-hidden';

/**
 * Adds an "Edit issue" button to the header of issue notes, and a command that does the same,
 * so an issue can be edited with proper pickers instead of raw properties.
 */
export class IssueNoteEditAction {
	private readonly buttons = new WeakMap<MarkdownView, HTMLElement>();
	private readonly allButtons = new Set<HTMLElement>();

	constructor(
		private readonly app: App,
		private readonly locations: BoardLocations,
		private readonly dialogs: IssueDialogs,
		private readonly feed: ChangeFeed,
	) {}

	attachTo(plugin: Plugin): void {
		const { workspace } = this.app;
		plugin.registerEvent(workspace.on('file-open', () => this.syncAll()));
		plugin.registerEvent(workspace.on('layout-change', () => this.syncAll()));
		// A project switch changes which notes are issue notes, without opening or closing any note.
		plugin.register(this.feed.subscribe(() => this.syncAll()));
		plugin.register(() => this.removeAll());
		plugin.addCommand({
			id: 'edit-issue',
			name: 'Edit issue',
			checkCallback: (checking) => {
				const key = this.keyOf(workspace.getActiveFile());
				if (key !== null && !checking) this.dialogs.editDetails(key);
				return key !== null;
			},
		});
		workspace.onLayoutReady(() => this.syncAll());
	}

	private syncAll(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView) this.sync(leaf.view);
		}
	}

	private sync(view: MarkdownView): void {
		const button = this.buttons.get(view) ?? this.addButton(view);
		button.toggleClass(HIDDEN_CLASS, this.keyOf(view.file) === null);
	}

	private addButton(view: MarkdownView): HTMLElement {
		const button = view.addAction('sliders-horizontal', 'Edit issue', () => {
			const key = this.keyOf(view.file);
			if (key !== null) this.dialogs.editDetails(key);
		});
		this.buttons.set(view, button);
		this.allButtons.add(button);
		view.register(() => this.allButtons.delete(button));
		return button;
	}

	private removeAll(): void {
		this.allButtons.forEach((button) => button.remove());
		this.allButtons.clear();
	}

	/** The issue key when the file is an issue note inside the issues folder. */
	private keyOf(file: TFile | null): string | null {
		if (!file || file.parent?.path !== this.locations.issuesFolder || !isIssueKey(file.basename)) return null;
		return file.basename;
	}
}
