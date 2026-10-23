import { Component, TAbstractFile, TFolder, Vault } from 'obsidian';
import { ProjectRegistry } from '../application/ports';
import { BoardLocations } from './boardLocations';
import { projectFolderChange } from './projectFolderChanges';

/**
 * Keeps project settings in step with project folders renamed, moved or deleted in the file
 * explorer, so a renamed project keeps its key prefix and workflow instead of being orphaned.
 */
export class ProjectFolderWatcher {
	constructor(
		private readonly vault: Vault,
		private readonly locations: BoardLocations,
		private readonly registry: Pick<ProjectRegistry, 'renameProject' | 'removeProject'>,
	) {}

	attachTo(owner: Component): void {
		owner.registerEvent(this.vault.on('rename', (file, oldPath) => this.onChange(file, oldPath, file.path)));
		owner.registerEvent(this.vault.on('delete', (file) => this.onChange(file, file.path, null)));
	}

	private onChange(file: TAbstractFile, oldPath: string, newPath: string | null): void {
		if (!(file instanceof TFolder)) return;
		const change = projectFolderChange(this.locations.projectsFolder, oldPath, newPath);
		if (change === null) return;
		const update = change.kind === 'renamed' ? this.registry.renameProject(change.from, change.to) : this.registry.removeProject(change.name);
		update.catch((error: unknown) => console.error('BoardMD: could not update projects after a folder change', error));
	}
}
