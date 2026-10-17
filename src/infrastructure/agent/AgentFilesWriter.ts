import { BoardConfig, IssueReader, SprintReader } from '../../application/ports';
import { BoardLocations } from '../boardLocations';
import { VaultNoteStore } from '../VaultNoteStore';
import { buildAgentIndex } from './agentIndex';
import { renderAgentGuide } from './agentGuide';

/** Keeps the generated `index.json` and `AGENTS.md` in the board folder up to date. */
export class AgentFilesWriter {
	constructor(
		private readonly store: VaultNoteStore,
		private readonly issues: IssueReader,
		private readonly sprints: SprintReader,
		private readonly config: BoardConfig,
		private readonly locations: BoardLocations,
	) {}

	/** Writes nothing when the project's folder is gone, so a deleted or renamed project is not recreated. */
	async writeIndex(): Promise<void> {
		if (!this.projectFolderExists()) return;
		const index = buildAgentIndex({
			issues: this.issues.findAll(),
			sprints: this.sprints.findAll(),
			workflow: this.config.workflow,
			keyPrefix: this.config.keyPrefix,
			locations: this.locations,
		});
		await this.store.writeFile(this.locations.agentIndexPath, `${JSON.stringify(index, null, 2)}\n`);
	}

	private projectFolderExists(): boolean {
		return this.store.folderExists(this.locations.boardFolder);
	}

	async writeGuide(): Promise<void> {
		if (!this.projectFolderExists()) return;
		const guide = renderAgentGuide({
			workflow: this.config.workflow,
			keyPrefix: this.config.keyPrefix,
			locations: this.locations,
		});
		await this.store.writeFile(this.locations.agentGuidePath, guide);
	}
}
