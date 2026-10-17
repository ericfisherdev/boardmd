import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentFilesSync } from '../src/infrastructure/agent/AgentFilesSync';

const IDLE_MS = 1000;

describe('AgentFilesSync', () => {
	let enabled: boolean;
	let writeIndex: ReturnType<typeof vi.fn<() => Promise<void>>>;
	let writeGuide: ReturnType<typeof vi.fn<() => Promise<void>>>;
	let sync: AgentFilesSync;

	beforeEach(() => {
		vi.useFakeTimers();
		// Tests run in Node, which has no window; timers are the only part of it the code uses.
		vi.stubGlobal('window', { setTimeout: setTimeout.bind(null), clearTimeout: clearTimeout.bind(null) });
		enabled = true;
		writeIndex = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		writeGuide = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
		sync = new AgentFilesSync({ writeIndex, writeGuide }, () => enabled, IDLE_MS);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('writes the index once after a burst of changes goes quiet, and leaves the guide alone', async () => {
		for (let change = 0; change < 20; change++) {
			sync.requestIndex();
			await vi.advanceTimersByTimeAsync(IDLE_MS / 2);
		}
		expect(writeIndex).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		expect(writeIndex).toHaveBeenCalledTimes(1);
		expect(writeGuide).not.toHaveBeenCalled();
	});

	it('writes the guide only when asked to', async () => {
		sync.requestGuide();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		expect(writeGuide).toHaveBeenCalledTimes(1);
		expect(writeIndex).not.toHaveBeenCalled();
	});

	it('writes once more, not once per request, when changes arrive during a write', async () => {
		let finishWrite = () => {};
		writeIndex.mockImplementationOnce(() => new Promise<void>((resolve) => (finishWrite = resolve)));
		sync.requestIndex();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		sync.requestIndex();
		sync.requestIndex();
		sync.requestIndex();
		await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
		expect(writeIndex).toHaveBeenCalledTimes(1);
		finishWrite();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		expect(writeIndex).toHaveBeenCalledTimes(2);
	});

	it('does nothing while agent files are turned off, and after cancel', async () => {
		enabled = false;
		sync.requestIndex();
		enabled = true;
		await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
		expect(writeIndex).not.toHaveBeenCalled();
		sync.requestIndex();
		sync.cancel();
		await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
		expect(writeIndex).not.toHaveBeenCalled();
	});

	it('keeps going after a failed write', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		writeIndex.mockRejectedValueOnce(new Error('disk full'));
		sync.requestIndex();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		sync.requestIndex();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		expect(writeIndex).toHaveBeenCalledTimes(2);
		expect(logged).toHaveBeenCalledTimes(1);
		logged.mockRestore();
	});

	it('flush writes pending changes now, without waiting for things to go quiet', async () => {
		sync.requestIndex();
		sync.requestGuide();
		await sync.flush();
		expect(writeIndex).toHaveBeenCalledTimes(1);
		expect(writeGuide).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
		expect(writeIndex).toHaveBeenCalledTimes(1);
	});

	it('flush waits for a write in progress and still writes changes that arrived meanwhile', async () => {
		let finishWrite = () => {};
		writeIndex.mockImplementationOnce(() => new Promise<void>((resolve) => (finishWrite = resolve)));
		sync.requestIndex();
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		sync.requestIndex();
		let flushed = false;
		void sync.flush().then(() => (flushed = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(flushed).toBe(false);
		finishWrite();
		await vi.advanceTimersByTimeAsync(0);
		expect(flushed).toBe(true);
		expect(writeIndex).toHaveBeenCalledTimes(2);
	});

	it('flush does nothing when nothing is stale', async () => {
		await sync.flush();
		expect(writeIndex).not.toHaveBeenCalled();
		expect(writeGuide).not.toHaveBeenCalled();
	});
});
