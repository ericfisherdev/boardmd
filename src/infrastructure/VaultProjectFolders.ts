import { normalizePath, TFile, TFolder, Vault } from 'obsidian';
import { ProjectFolders } from '../application/ports';
import { isValidProjectName } from '../domain/project';
import { BoardLocations, locationsFor } from './boardLocations';
import { VaultNoteStore } from './VaultNoteStore';

/** Projects as the subfolders of the projects folder. */
export class VaultProjectFolders implements ProjectFolders {
	constructor(
		private readonly vault: Vault,
		private readonly store: VaultNoteStore,
		private readonly locations: BoardLocations,
	) {}

	list(): string[] {
		const root = this.vault.getAbstractFileByPath(normalizePath(this.locations.projectsFolder));
		if (!(root instanceof TFolder)) return [];
		return root.children
			.filter((child): child is TFolder => child instanceof TFolder)
			.map((folder) => folder.name)
			.filter(isValidProjectName);
	}

	issueNoteNames(name: string): string[] {
		const folder = this.vault.getAbstractFileByPath(normalizePath(locationsFor(this.locations.projectsFolder, name).issuesFolder));
		if (!(folder instanceof TFolder)) return [];
		return folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md').map((file) => file.basename);
	}

	async create(name: string): Promise<void> {
		const { issuesFolder, sprintsFolder } = locationsFor(this.locations.projectsFolder, name);
		await this.store.ensureFolder(issuesFolder);
		await this.store.ensureFolder(sprintsFolder);
	}
}
