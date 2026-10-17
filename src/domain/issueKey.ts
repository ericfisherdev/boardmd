const ISSUE_KEY_PATTERN = /^([A-Z][A-Z0-9]*)-(\d+)$/;

export function isIssueKey(value: string): boolean {
	return ISSUE_KEY_PATTERN.test(value);
}

export function isValidKeyPrefix(prefix: string): boolean {
	return /^[A-Z][A-Z0-9]*$/.test(prefix);
}

export function formatIssueKey(prefix: string, issueNumber: number): string {
	return `${prefix}-${issueNumber}`;
}

/** The prefix most issue keys use, e.g. `WEB` for `WEB-1`, `WEB-2`, `SITE-3`; ties go to the alphabetically first. Null when no key is valid. */
export function dominantKeyPrefix(keys: Iterable<string>): string | null {
	const counts = new Map<string, number>();
	for (const key of keys) {
		const prefix = ISSUE_KEY_PATTERN.exec(key)?.[1];
		if (prefix !== undefined) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
	}
	const ranked = [...counts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
	return ranked[0]?.[0] ?? null;
}

/** The next `count` keys for the prefix that no existing issue uses and `isTaken` does not report as used. */
export function nextFreeKeys(prefix: string, existingKeys: Iterable<string>, isTaken: (key: string) => boolean, count: number): string[] {
	const keys: string[] = [];
	for (let issueNumber = nextIssueNumber(existingKeys, prefix); keys.length < count; issueNumber++) {
		const key = formatIssueKey(prefix, issueNumber);
		if (!isTaken(key)) keys.push(key);
	}
	return keys;
}

/** Next unused number for the prefix, one past the highest existing key that uses it. */
export function nextIssueNumber(existingKeys: Iterable<string>, prefix: string): number {
	let highest = 0;
	for (const key of existingKeys) {
		const match = ISSUE_KEY_PATTERN.exec(key);
		if (match?.[1] === prefix) highest = Math.max(highest, Number(match[2]));
	}
	return highest + 1;
}
