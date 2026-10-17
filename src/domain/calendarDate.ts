/** Calendar dates are local `YYYY-MM-DD` strings; never derived from UTC. */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isCalendarDate(value: unknown): value is string {
	return typeof value === 'string' && DATE_PATTERN.test(value);
}

export function formatCalendarDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

function toLocalDate(value: string): Date {
	const match = DATE_PATTERN.exec(value);
	if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(value: string, days: number): string {
	const date = toLocalDate(value);
	date.setDate(date.getDate() + days);
	return formatCalendarDate(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round((toLocalDate(to).getTime() - toLocalDate(from).getTime()) / MS_PER_DAY);
}
