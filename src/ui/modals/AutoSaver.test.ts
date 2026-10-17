import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSaver, AutoSaveState } from './AutoSaver';

function createSaver(save: () => Promise<void>) {
	const states: AutoSaveState[] = [];
	const saver = new AutoSaver({
		save,
		settled: () => Promise.resolve(),
		delayMs: 500,
		onStateChange: (state) => states.push(state),
	});
	return { saver, states };
}

describe('AutoSaver', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Tests run in Node, which has no window; timers are the only part of it the code uses.
		vi.stubGlobal('window', { setTimeout: setTimeout.bind(null), clearTimeout: clearTimeout.bind(null) });
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('saves once after a pause, however many edits came before it', async () => {
		const save = vi.fn().mockResolvedValue(undefined);
		const { saver, states } = createSaver(save);
		saver.schedule();
		await vi.advanceTimersByTimeAsync(300);
		saver.schedule();
		await vi.advanceTimersByTimeAsync(300);
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(300);
		expect(save).toHaveBeenCalledTimes(1);
		expect(states.at(-1)).toBe(AutoSaveState.Saved);
	});

	it('flush saves immediately, and does nothing when nothing changed', async () => {
		const save = vi.fn().mockResolvedValue(undefined);
		const { saver } = createSaver(save);
		await saver.flush();
		expect(save).not.toHaveBeenCalled();
		saver.schedule();
		await saver.flush();
		expect(save).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('never overlaps saves, and saves an edit made during a save afterwards', async () => {
		let running = 0;
		let overlapped = false;
		const save = vi.fn(async () => {
			running++;
			overlapped ||= running > 1;
			await new Promise((resolve) => window.setTimeout(resolve, 200));
			running--;
		});
		const { saver, states } = createSaver(save);
		saver.schedule();
		await vi.advanceTimersByTimeAsync(500);
		saver.schedule();
		await vi.advanceTimersByTimeAsync(100);
		expect(states.at(-1)).toBe(AutoSaveState.Pending);
		await vi.advanceTimersByTimeAsync(2000);
		expect(save).toHaveBeenCalledTimes(2);
		expect(overlapped).toBe(false);
		expect(states.at(-1)).toBe(AutoSaveState.Saved);
	});

	it('keeps a failed save unsaved so a later flush retries it', async () => {
		const failure = new Error('boom');
		const save = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
		const { saver, states } = createSaver(save);
		saver.schedule();
		await expect(saver.flush()).rejects.toBe(failure);
		expect(states.at(-1)).toBe(AutoSaveState.Failed);
		await saver.flush();
		expect(save).toHaveBeenCalledTimes(2);
		expect(states.at(-1)).toBe(AutoSaveState.Saved);
	});
});
