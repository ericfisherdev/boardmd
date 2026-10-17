export enum AutoSaveState {
	/** Nothing edited yet. */
	Idle = 'idle',
	/** Edited, waiting for a pause before saving. */
	Pending = 'pending',
	Saving = 'saving',
	Saved = 'saved',
	Failed = 'failed',
}

export interface AutoSaverOptions {
	/** Persists the form's current values. Throw to report a failed save. */
	readonly save: () => Promise<void>;
	/** Resolves once the vault reflects a finished save, so the next save starts from fresh data. */
	readonly settled: () => Promise<void>;
	/** Quiet time after the last edit before saving. */
	readonly delayMs: number;
	readonly onStateChange: (state: AutoSaveState, error: unknown) => void;
}

/**
 * Saves edits after a pause. Saves never overlap, and an edit made while one is running
 * triggers another afterwards, so the last edit always wins.
 */
export class AutoSaver {
	private timer: number | null = null;
	private dirty = false;
	private queue: Promise<void> = Promise.resolve();

	constructor(private readonly options: AutoSaverOptions) {}

	/** Records an edit and (re)starts the quiet-time countdown. */
	schedule(): void {
		this.dirty = true;
		this.cancelTimer();
		this.options.onStateChange(AutoSaveState.Pending, null);
		this.timer = window.setTimeout(() => void this.flush().catch(() => undefined), this.options.delayMs);
	}

	/**
	 * Saves now if anything is unsaved, after any save already running. A failed save stays unsaved,
	 * so a later flush retries it.
	 * @throws whatever `save` throws, for the caller to surface.
	 */
	flush(): Promise<void> {
		this.cancelTimer();
		const run = this.queue.catch(() => undefined).then(() => this.saveIfDirty());
		this.queue = run;
		return run;
	}

	private async saveIfDirty(): Promise<void> {
		if (!this.dirty) return;
		this.dirty = false;
		this.options.onStateChange(AutoSaveState.Saving, null);
		try {
			await this.options.save();
			await this.options.settled();
		} catch (error) {
			this.dirty = true;
			this.options.onStateChange(AutoSaveState.Failed, error);
			throw error;
		}
		this.options.onStateChange(this.dirty ? AutoSaveState.Pending : AutoSaveState.Saved, null);
	}

	private cancelTimer(): void {
		if (this.timer === null) return;
		window.clearTimeout(this.timer);
		this.timer = null;
	}
}
