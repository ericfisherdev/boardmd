import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexingTracker } from '../src/infrastructure/IndexingTracker';

const SETTLE_TIMEOUT_MS = 1000;

describe('IndexingTracker', () => {
	let tracker: IndexingTracker;
	let settled: ReturnType<typeof vi.fn<() => void>>;

	const waitForSettled = () => {
		void tracker.whenSettled().then(() => {
			settled();
		});
	};

	beforeEach(() => {
		vi.useFakeTimers();
		// Tests run in Node, which has no window; timers are the only part of it the code uses.
		vi.stubGlobal('window', { setTimeout: setTimeout.bind(null), clearTimeout: clearTimeout.bind(null) });
		tracker = new IndexingTracker({} as never);
		settled = vi.fn<() => void>();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('is settled straight away when nothing was written', async () => {
		waitForSettled();
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toHaveBeenCalledTimes(1);
	});

	it('waits until every written note has been re-indexed, not just the first', async () => {
		tracker.expectIndexing('Board/issues/OB-1.md');
		tracker.expectIndexing('Board/issues/OB-2.md');
		waitForSettled();
		tracker.markIndexed('Board/issues/OB-1.md');
		await vi.advanceTimersByTimeAsync(100);
		expect(settled).not.toHaveBeenCalled();
		tracker.markIndexed('Board/issues/OB-2.md');
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toHaveBeenCalledTimes(1);
	});

	it('does not miss an index event that arrives before the waiting starts', async () => {
		tracker.expectIndexing('Board/issues/OB-1.md');
		tracker.markIndexed('Board/issues/OB-1.md');
		waitForSettled();
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toHaveBeenCalledTimes(1);
	});

	it('gives up after a timeout when a write never produces an index event', async () => {
		tracker.expectIndexing('Board/issues/OB-1.md');
		waitForSettled();
		await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS - 1);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalledTimes(1);
		waitForSettled();
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toHaveBeenCalledTimes(2);
	});

	it('ignores index events for notes it was not told about', async () => {
		tracker.expectIndexing('Board/issues/OB-1.md');
		waitForSettled();
		tracker.markIndexed('Board/issues/OB-9.md');
		await vi.advanceTimersByTimeAsync(100);
		expect(settled).not.toHaveBeenCalled();
	});
});
