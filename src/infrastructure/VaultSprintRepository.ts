import { SprintRepository } from '../application/ports';
import { SprintNotFoundError } from '../domain/errors';
import { Sprint, SprintChanges } from '../domain/sprint';
import { BoardLocations } from './boardLocations';
import { readSprint, sprintFrontmatter, writeSprintChanges } from './frontmatter/sprintFrontmatter';
import { VaultNoteStore } from './VaultNoteStore';

/** Sprints stored as `<sprintsFolder>/<name>.md`, with fields in frontmatter. */
export class VaultSprintRepository implements SprintRepository {
	constructor(
		private readonly store: VaultNoteStore,
		private readonly locations: BoardLocations,
	) {}

	findAll(): Sprint[] {
		return this.store.list(this.locations.sprintsFolder).map((note) => readSprint(note.basename, note.frontmatter));
	}

	findByName(name: string): Sprint | null {
		const note = this.store.read(this.locations.sprintsFolder, name);
		return note ? readSprint(note.basename, note.frontmatter) : null;
	}

	async create(sprint: Sprint): Promise<void> {
		await this.store.create(this.locations.sprintsFolder, sprint.name, sprintFrontmatter(sprint), '');
	}

	/** @throws SprintNotFoundError, YAMLParseError */
	async update(name: string, changes: SprintChanges): Promise<void> {
		const updated = await this.store.updateFrontmatter(this.locations.sprintsFolder, name, (frontmatter) =>
			writeSprintChanges(frontmatter, changes),
		);
		if (!updated) throw new SprintNotFoundError(name);
	}
}
