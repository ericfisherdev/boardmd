import { formatCalendarDate, isCalendarDate } from '../../domain/calendarDate';

/** Lenient readers and writers for frontmatter values, which may be hand-edited by people or agents. */

export type Frontmatter = Record<string, unknown>;

export function toWikilink(noteName: string): string {
	return `[[${noteName}]]`;
}

/** Link that names the folder too, for notes whose name other projects reuse (`[[Board/sprints/Sprint 1|Sprint 1]]`). */
export function toPathWikilink(folder: string, noteName: string): string {
	return `[[${folder}/${noteName}|${noteName}]]`;
}

/** Note name from `[[Name]]`, `[[folder/Name|alias]]` or a plain `Name`; null when absent or blank. */
export function readNoteReference(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const wikilink = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(value.trim());
	const target = (wikilink?.[1] ?? value).trim();
	const name = target.split('/').pop()?.replace(/\.md$/, '').trim() ?? '';
	return name === '' ? null : name;
}

/** Note names from a list (or a single value) of references, without duplicates. */
export function readNoteReferences(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	const names = values.map(readNoteReference).filter((name): name is string => name !== null);
	return [...new Set(names)];
}

export function readString(value: unknown): string | null {
	if (typeof value === 'number') return String(value);
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

export function readNumber(value: unknown): number | null {
	const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** Local YYYY-MM-DD date from a string or a YAML-parsed Date; null otherwise. */
export function readDate(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return formatCalendarDate(value);
	return isCalendarDate(value) ? value : null;
}

export function readEnum<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
	return allowed.find((candidate) => candidate === value) ?? fallback;
}

/** Sets the field, or removes it when the value is null or an empty list, keeping notes tidy. */
export function writeField(frontmatter: Frontmatter, field: string, value: unknown): void {
	if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
		delete frontmatter[field];
	} else {
		frontmatter[field] = value;
	}
}
