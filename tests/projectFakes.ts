import { ProjectFolders, ProjectRegistry, WorkSettler } from '../src/application/ports';
import { UnknownProjectError } from '../src/domain/errors';
import { ProjectSettings } from '../src/domain/project';

export class FakeRegistry implements ProjectRegistry {
	/** What happened, in order, for tests that care about sequencing. */
	readonly log: string[] = [];

	constructor(
		public activeProject: string,
		readonly projects: Map<string, ProjectSettings>,
	) {}

	configuredProjects(): ReadonlyMap<string, ProjectSettings> {
		return new Map(this.projects);
	}

	async saveProject(name: string, settings: ProjectSettings): Promise<void> {
		this.log.push(`save ${name}`);
		this.projects.set(name, settings);
	}

	async activate(name: string): Promise<void> {
		if (!this.projects.has(name)) throw new UnknownProjectError(name);
		this.log.push(`activate ${name}`);
		this.activeProject = name;
	}

	async renameProject(oldName: string, newName: string): Promise<void> {
		const settings = this.projects.get(oldName);
		if (!settings) return;
		this.projects.delete(oldName);
		this.projects.set(newName, settings);
		if (this.activeProject === oldName) this.activeProject = newName;
	}

	async removeProject(name: string): Promise<void> {
		this.projects.delete(name);
	}
}

export class FakeFolders implements ProjectFolders {
	readonly existing = new Set<string>();
	readonly notes = new Map<string, string[]>();

	list(): string[] {
		return [...this.existing];
	}

	issueNoteNames(name: string): string[] {
		return this.notes.get(name) ?? [];
	}

	async create(name: string): Promise<void> {
		this.existing.add(name);
	}
}

/** Records when pending work was settled, so tests can check it happens before a switch. */
export class RecordingSettler implements WorkSettler {
	constructor(private readonly log: string[]) {}

	async settle(): Promise<void> {
		this.log.push('settle');
	}
}
