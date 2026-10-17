import { Menu } from 'obsidian';
import { IssueNavigator } from '../infrastructure/WorkspaceIssueNavigator';
import { IssueDialogs } from './IssueDialogs';
import { runReporting } from './reportError';

/** Context menu with every action available on an issue. */
export class IssueMenu {
	constructor(
		private readonly navigator: IssueNavigator,
		private readonly dialogs: IssueDialogs,
	) {}

	showAtMouse(key: string, event: MouseEvent): void {
		this.build(key).showAtMouseEvent(event);
	}

	showBelow(key: string, anchor: HTMLElement): void {
		const box = anchor.getBoundingClientRect();
		this.build(key).showAtPosition({ x: box.left, y: box.bottom });
	}

	private build(key: string): Menu {
		return new Menu()
			.addItem((item) => item.setTitle('Open note').setIcon('file-text').onClick(() => runReporting(() => this.navigator.open(key, false))))
			.addItem((item) => item.setTitle('Open in new tab').setIcon('file-plus').onClick(() => runReporting(() => this.navigator.open(key, true))))
			.addSeparator()
			.addItem((item) => item.setTitle('Edit details…').setIcon('pencil').onClick(() => this.dialogs.editDetails(key)))
			.addItem((item) => item.setTitle('Change status…').setIcon('columns-3').onClick(() => this.dialogs.changeStatus(key)))
			.addItem((item) => item.setTitle('Move to sprint or backlog…').setIcon('move-right').onClick(() => this.dialogs.move(key)))
			.addSeparator()
			.addItem((item) => item.setTitle('Set parent…').setIcon('git-fork').onClick(() => this.dialogs.setParent(key)))
			.addItem((item) => item.setTitle('Add link…').setIcon('link').onClick(() => this.dialogs.addLink(key)))
			.addItem((item) => item.setTitle('Remove link…').setIcon('unlink').onClick(() => this.dialogs.removeLink(key)));
	}
}
