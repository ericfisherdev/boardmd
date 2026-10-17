import { Workspace } from 'obsidian';
import { BoardLocations } from './boardLocations';
import { VaultNoteStore } from './VaultNoteStore';

export interface IssueNavigator {
	/** Opens the issue's note; in a new tab when `newTab` is true. */
	open(key: string, newTab: boolean): Promise<void>;
}

export class WorkspaceIssueNavigator implements IssueNavigator {
	constructor(
		private readonly workspace: Workspace,
		private readonly store: VaultNoteStore,
		private readonly locations: BoardLocations,
	) {}

	async open(key: string, newTab: boolean): Promise<void> {
		const file = this.store.file(this.locations.issuesFolder, key);
		if (file) await this.workspace.getLeaf(newTab ? 'tab' : false).openFile(file);
	}
}
