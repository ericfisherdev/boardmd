export const RANK_STEP = 1000;
const MIN_RANK_GAP = 1e-6;

export interface Ranked {
	readonly key: string;
	readonly rank: number;
}

export interface RankAssignment {
	readonly key: string;
	readonly rank: number;
}

export function byRank(a: Ranked, b: Ranked): number {
	return a.rank - b.rank || a.key.localeCompare(b.key, undefined, { numeric: true });
}

export function rankAfterLast(sequence: readonly Ranked[]): number {
	const last = Math.max(...sequence.map((item) => item.rank), 0);
	return last + RANK_STEP;
}

/**
 * Ranks needed to place `movingKey` directly before `beforeKey` (or last when null) in `sequence`.
 * Usually one assignment; when neighbours are too close it re-spaces the whole sequence.
 */
export function planPlacement(
	sequence: readonly Ranked[],
	movingKey: string,
	beforeKey: string | null,
): RankAssignment[] {
	const others = [...sequence].filter((item) => item.key !== movingKey).sort(byRank);
	const index = insertionIndex(others, beforeKey);
	const rank = rankBetween(others[index - 1]?.rank ?? null, others[index]?.rank ?? null);
	if (rank !== null) return [{ key: movingKey, rank }];
	const orderedKeys = others.map((item) => item.key);
	orderedKeys.splice(index, 0, movingKey);
	return orderedKeys.map((key, position) => ({ key, rank: (position + 1) * RANK_STEP }));
}

function insertionIndex(ordered: readonly Ranked[], beforeKey: string | null): number {
	if (beforeKey === null) return ordered.length;
	const index = ordered.findIndex((item) => item.key === beforeKey);
	return index === -1 ? ordered.length : index;
}

/** A rank strictly between the neighbours, or null when they are too close to split. */
export function rankBetween(previous: number | null, next: number | null): number | null {
	if (previous === null && next === null) return RANK_STEP;
	if (previous === null) return (next as number) - RANK_STEP;
	if (next === null) return previous + RANK_STEP;
	if (next - previous < MIN_RANK_GAP) return null;
	return (previous + next) / 2;
}
