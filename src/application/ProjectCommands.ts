import {
	DuplicateKeyPrefixError,
	DuplicateProjectNameError,
	InvalidKeyPrefixError,
	InvalidSprintLengthError,
	UnknownProjectError,
} from '../domain/errors';
import { dominantKeyPrefix, isValidKeyPrefix } from '../domain/issueKey';
import { assertValidProjectName, isSameProjectName, ProjectSettings, suggestKeyPrefix } from '../domain/project';
import { ProjectFolders, ProjectRegistry, WorkSettler } from './ports';

/** Lists, creates and switches between projects, and edits the active project's settings. */
export class ProjectCommands {
	constructor(
		private readonly registry: ProjectRegistry,
		private readonly folders: ProjectFolders,
		private readonly pendingWork: WorkSettler,
	) {}

	get activeProject(): string {
		return this.registry.activeProject;
	}

	/**
	 * Every project, sorted by name: the active one, configured projects, and folders in the vault.
	 * Names differing only in letter case are one project (one folder on many file systems); the
	 * spelling already in use wins.
	 */
	names(): string[] {
		const names: string[] = [];
		for (const name of [this.registry.activeProject, ...this.registry.configuredProjects().keys(), ...this.folders.list()]) {
			if (!names.some((existing) => isSameProjectName(existing, name))) names.push(name);
		}
		return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
	}

	/** A prefix no project uses yet, derived from the name. */
	suggestKeyPrefix(projectName: string): string {
		return suggestKeyPrefix(projectName, this.takenPrefixes());
	}

	/**
	 * Creates the project's folders and settings, then switches to it. It starts with the active
	 * project's sprint length and workflow, which can be changed afterwards.
	 * @throws InvalidProjectNameError, DuplicateProjectNameError, InvalidKeyPrefixError, DuplicateKeyPrefixError
	 */
	async create(name: string, keyPrefix: string): Promise<void> {
		assertValidProjectName(name);
		if (this.names().some((existing) => isSameProjectName(existing, name))) throw new DuplicateProjectNameError(name);
		this.assertUsablePrefix(keyPrefix, null);
		const template = this.activeSettings();
		await this.folders.create(name);
		await this.registry.saveProject(name, { ...template, keyPrefix, repository: null });
		await this.pendingWork.settle();
		await this.registry.activate(name);
	}

	/**
	 * Shows the project on the board, after work still pending on the current project has finished.
	 * A project folder the plugin has not seen before gets settings that fit the notes in it.
	 * @throws UnknownProjectError
	 */
	async switchTo(name: string): Promise<void> {
		if (name === this.registry.activeProject) return;
		if (!this.names().includes(name)) throw new UnknownProjectError(name);
		await this.pendingWork.settle();
		if (!this.registry.configuredProjects().has(name)) await this.registry.saveProject(name, this.adoptedSettings(name));
		await this.registry.activate(name);
	}

	/**
	 * @throws InvalidKeyPrefixError, DuplicateKeyPrefixError
	 */
	async changeKeyPrefix(prefix: string): Promise<void> {
		this.assertUsablePrefix(prefix, this.registry.activeProject);
		await this.registry.saveProject(this.registry.activeProject, { ...this.activeSettings(), keyPrefix: prefix });
	}

	/** @throws InvalidSprintLengthError */
	async changeSprintLength(days: number): Promise<void> {
		if (!Number.isInteger(days) || days < 1) throw new InvalidSprintLengthError(days);
		await this.registry.saveProject(this.registry.activeProject, { ...this.activeSettings(), sprintLengthDays: days });
	}

	private activeSettings(): ProjectSettings {
		const settings = this.registry.configuredProjects().get(this.registry.activeProject);
		if (!settings) throw new UnknownProjectError(this.registry.activeProject);
		return settings;
	}

	/**
	 * Settings for a folder that already exists: the key prefix its issue notes use, if no other
	 * project has it, otherwise one derived from the name; the rest copies the active project.
	 */
	private adoptedSettings(name: string): ProjectSettings {
		const { sprintLengthDays, statuses } = this.activeSettings();
		const taken = this.takenPrefixes();
		const existing = dominantKeyPrefix(this.folders.issueNoteNames(name));
		const keyPrefix = existing !== null && !taken.has(existing) ? existing : suggestKeyPrefix(name, taken);
		return { keyPrefix, sprintLengthDays, statuses, repository: null };
	}

	private takenPrefixes(): Set<string> {
		return new Set([...this.registry.configuredProjects().values()].map((settings) => settings.keyPrefix));
	}

	/** @param ownerName the project allowed to already hold the prefix (the one being edited). */
	private assertUsablePrefix(prefix: string, ownerName: string | null): void {
		if (!isValidKeyPrefix(prefix)) throw new InvalidKeyPrefixError(prefix);
		for (const [name, settings] of this.registry.configuredProjects()) {
			if (name !== ownerName && settings.keyPrefix === prefix) throw new DuplicateKeyPrefixError(prefix, name);
		}
	}
}
