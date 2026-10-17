/** What gets written; implemented by {@link AgentFilesWriter}. */
export interface AgentFileTargets {
	writeIndex(): Promise<void>;
	writeGuide(): Promise<void>;
}

/** Quiet time after the last request before the files are rewritten. */
const IDLE_BEFORE_WRITE_MS = 1500;

/**
 * Keeps the agent index and guide current without rewriting them on every board change. Requests
 * only mark a file as stale; one write runs after things go quiet, and a request that arrives
 * during a write triggers exactly one more afterwards.
 */
export class AgentFilesSync {
	private indexStale = false;
	private guideStale = false;
	private running: Promise<void> | null = null;
	private timer: number | null = null;

	constructor(
		private readonly writer: AgentFileTargets,
		private readonly isEnabled: () => boolean,
		private readonly idleMs: number = IDLE_BEFORE_WRITE_MS,
	) {}

	/** Board data changed. Does nothing when agent files are turned off. */
	requestIndex(): void {
		this.markStale(() => (this.indexStale = true));
	}

	/** Settings that shape the guide changed. Does nothing when agent files are turned off. */
	requestGuide(): void {
		this.markStale(() => (this.guideStale = true));
	}

	/**
	 * Writes anything stale right now, after a write already in progress. Call before the files'
	 * location changes (a project switch), so pending changes reach the folder they belong to.
	 */
	async flush(): Promise<void> {
		this.cancelTimer();
		await this.running;
		await this.writeStaleFiles();
	}

	/** Drops pending work; call when the plugin unloads. */
	cancel(): void {
		this.cancelTimer();
		this.indexStale = false;
		this.guideStale = false;
	}

	private cancelTimer(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
	}

	private markStale(mark: () => void): void {
		if (!this.isEnabled()) return;
		mark();
		this.cancelTimer();
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.writeStaleFiles();
		}, this.idleMs);
	}

	private writeStaleFiles(): Promise<void> {
		this.running ??= this.writeUntilClean().finally(() => (this.running = null));
		return this.running;
	}

	private async writeUntilClean(): Promise<void> {
		while (this.guideStale || this.indexStale) await this.writeOnce();
	}

	private async writeOnce(): Promise<void> {
		const { guideStale, indexStale } = this;
		this.guideStale = false;
		this.indexStale = false;
		try {
			if (guideStale) await this.writer.writeGuide();
			if (indexStale) await this.writer.writeIndex();
		} catch (error) {
			console.error('Obsidiboard: could not write agent files', error);
		}
	}
}
