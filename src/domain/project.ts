import { InvalidProjectNameError } from './errors';
import { RepositoryLink } from './repository';
import { StatusDefinition } from './workflow';

/** Settings that belong to one project; each project has its own key prefix, sprint length and workflow. */
export interface ProjectSettings {
	readonly keyPrefix: string;
	readonly sprintLengthDays: number;
	readonly statuses: readonly StatusDefinition[];
	/** The GitHub or GitLab repository issues are pulled from; null when none is linked. */
	readonly repository: RepositoryLink | null;
}

/** Project folders that would be confused with a board's own subfolders. */
const RESERVED_PROJECT_NAMES = ['issues', 'sprints'];
const FORBIDDEN_NAME_CHARACTERS = /[\\/:*?"<>|#^[\]]/;
const MAX_DERIVED_PREFIX_LENGTH = 4;
const FALLBACK_PREFIX = 'PRJ';

/**
 * Whether the name can be a project: a folder name that is not hidden, not one of a board's own
 * subfolders, and not a name every object already has (`constructor`, `__proto__`, ...), since
 * projects are stored under their names.
 */
export function isValidProjectName(name: string): boolean {
	return !(
		name.trim() === '' ||
		name !== name.trim() ||
		name.startsWith('.') ||
		FORBIDDEN_NAME_CHARACTERS.test(name) ||
		RESERVED_PROJECT_NAMES.includes(name.toLowerCase()) ||
		name in Object.prototype
	);
}

/** @throws InvalidProjectNameError when the name cannot be used as a project name. */
export function assertValidProjectName(name: string): void {
	if (!isValidProjectName(name)) throw new InvalidProjectNameError(name);
}

/** Project names are folder names, so they are compared without regard to case. */
export function isSameProjectName(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

/**
 * A key prefix for a project that no other project uses. Issue notes are linked by file name, so
 * two projects sharing a prefix would make links ambiguous.
 * Initials of a multi-word name (`Web Shop` → `WS`), else its first three letters (`Website` → `WEB`).
 */
export function suggestKeyPrefix(projectName: string, takenPrefixes: ReadonlySet<string>): string {
	const words = projectName.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
	const derived = words.length > 1 ? words.map((word) => word.slice(0, 1)).join('') : (words[0] ?? '').slice(0, 3);
	const base = derived.toUpperCase().replace(/^[0-9]+/, '').slice(0, MAX_DERIVED_PREFIX_LENGTH) || FALLBACK_PREFIX;
	let prefix = base;
	for (let attempt = 2; takenPrefixes.has(prefix); attempt++) prefix = `${base}${attempt}`;
	return prefix;
}
