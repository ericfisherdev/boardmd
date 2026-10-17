import { Component, debounce, MetadataCache, TAbstractFile, Vault } from 'obsidian';
import { ChangeFeed } from '../application/ports';
import { BoardLocations } from './boardLocations';

const CHANGE_DEBOUNCE_MS = 60;

/** Announces, debounced, any change to issue or sprint notes, plus explicit refresh requests. */
export class VaultChangeFeed implements ChangeFeed {
	private readonly listeners = new Set<() => void>();
	private readonly announce = debounce(() => this.listeners.forEach((listener) => listener()), CHANGE_DEBOUNCE_MS, true);

	constructor(
		private readonly vault: Vault,
		private readonly metadataCache: MetadataCache,
		private readonly locations: BoardLocations,
	) {}

	/** Starts watching the vault for as long as the owning component is loaded. */
	attachTo(owner: Component): void {
		owner.registerEvent(this.metadataCache.on('changed', (file) => this.announceIfBoardFile(file)));
		owner.registerEvent(this.metadataCache.on('deleted', (file) => this.announceIfBoardFile(file)));
		owner.registerEvent(
			this.vault.on('rename', (file, oldPath) => {
				if (this.isBoardPath(file.path) || this.isBoardPath(oldPath)) this.announce();
			}),
		);
		owner.register(() => this.announce.cancel());
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Forces subscribers to refresh, e.g. after settings change. */
	refresh(): void {
		this.announce();
	}

	private announceIfBoardFile(file: TAbstractFile): void {
		if (this.isBoardPath(file.path)) this.announce();
	}

	private isBoardPath(path: string): boolean {
		return [this.locations.issuesFolder, this.locations.sprintsFolder].some((folder) => path.startsWith(`${folder}/`));
	}
}
