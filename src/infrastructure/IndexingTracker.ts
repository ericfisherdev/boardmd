import type { Component, MetadataCache } from 'obsidian';
import { WriteSettlement } from '../application/ports';

/** Longest a caller waits for notes to be re-indexed; covers writes that change nothing on disk. */
const SETTLE_TIMEOUT_MS = 1000;

/**
 * Knows which notes were written but not yet re-indexed by Obsidian's metadata cache. Board reads
 * come from that cache, so a read made before indexing finishes sees the note as it was before the write.
 */
export class IndexingTracker implements WriteSettlement {
	private readonly pending = new Set<string>();
	private waiters: (() => void)[] = [];

	constructor(private readonly metadataCache: MetadataCache) {}

	/** Starts listening for the cache catching up, for as long as the owner is loaded. */
	attachTo(owner: Component): void {
		owner.registerEvent(this.metadataCache.on('changed', (file) => this.markIndexed(file.path)));
		owner.registerEvent(this.metadataCache.on('deleted', (file) => this.markIndexed(file.path)));
	}

	/** Call before writing a note, so an index event that arrives mid-write is not missed. */
	expectIndexing(path: string): void {
		this.pending.add(path);
	}

	markIndexed(path: string): void {
		if (this.pending.delete(path)) this.releaseWaitersIfIdle();
	}

	/** Resolves once every note written so far is visible to reads, or after a timeout. */
	whenSettled(): Promise<void> {
		if (this.pending.size === 0) return Promise.resolve();
		return new Promise((resolve) => {
			const timer = window.setTimeout(() => {
				this.pending.clear();
				this.releaseWaitersIfIdle();
			}, SETTLE_TIMEOUT_MS);
			this.waiters.push(() => {
				window.clearTimeout(timer);
				resolve();
			});
		});
	}

	private releaseWaitersIfIdle(): void {
		if (this.pending.size > 0) return;
		const waiting = this.waiters;
		this.waiters = [];
		waiting.forEach((release) => release());
	}
}
