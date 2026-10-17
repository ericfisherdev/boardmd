import { BoardConfig, ProjectRegistry } from '../application/ports';
import { UnknownProjectError } from '../domain/errors';
import { isValidKeyPrefix } from '../domain/issueKey';
import { assertValidProjectName, isSameProjectName, isValidProjectName, ProjectSettings, suggestKeyPrefix } from '../domain/project';
import { isValidRepositoryHost, isValidRepositoryPath, RepositoryLink, RepositoryProvider } from '../domain/repository';
import { findWorkflowProblems, SIMPLE_WORKFLOW, StatusCategory, StatusDefinition, Workflow } from '../domain/workflow';
import { BoardLocations, locationsFor } from '../infrastructure/boardLocations';
import { readEnum, readString } from '../infrastructure/frontmatter/values';

export interface ObsidiboardSettings {
	/** Folder holding one subfolder per project. */
	projectsFolder: string;
	/** The project the board shows. */
	activeProject: string;
	/** Per-project settings, by project (folder) name. */
	projects: Record<string, ProjectSettings>;
	writeAgentFiles: boolean;
}

/** Settings that apply to every project. */
export type GeneralSettings = Pick<ObsidiboardSettings, 'projectsFolder' | 'writeAgentFiles'>;

export const DEFAULT_PROJECT_NAME = 'My project';
export const DEFAULT_SPRINT_LENGTH_DAYS = 14;

const DEFAULT_PROJECTS_FOLDER = 'Projects';

/** Coerces persisted data (possibly hand-edited or from an older version) into valid settings. */
export function sanitizeSettings(raw: unknown): ObsidiboardSettings {
	const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof ObsidiboardSettings, unknown>>;
	const projects = sanitizeProjects(data.projects);
	const requested = typeof data.activeProject === 'string' ? data.activeProject : '';
	const known = Object.keys(projects).find((name) => isSameProjectName(name, requested));
	const activeProject = known ?? (isValidProjectName(requested) ? requested : (Object.keys(projects)[0] ?? DEFAULT_PROJECT_NAME));
	if (!hasProject(projects, activeProject)) projects[activeProject] = defaultProjectSettings(activeProject, projects);
	return {
		projectsFolder: sanitizeFolder(data.projectsFolder),
		activeProject,
		projects,
		writeAgentFiles: typeof data.writeAgentFiles === 'boolean' ? data.writeAgentFiles : true,
	};
}

export function sanitizeFolder(value: unknown): string {
	if (typeof value !== 'string') return DEFAULT_PROJECTS_FOLDER;
	const folder = value.trim().replace(/^\/+|\/+$/g, '');
	return folder === '' ? DEFAULT_PROJECTS_FOLDER : folder;
}

/** Own entries only: a project must never be found through the object's prototype. */
function hasProject(projects: Readonly<Record<string, ProjectSettings>>, name: string): boolean {
	return Object.prototype.hasOwnProperty.call(projects, name);
}

function defaultProjectSettings(name: string, others: Readonly<Record<string, ProjectSettings>>): ProjectSettings {
	const taken = new Set(Object.values(others).map((settings) => settings.keyPrefix));
	return { keyPrefix: suggestKeyPrefix(name, taken), sprintLengthDays: DEFAULT_SPRINT_LENGTH_DAYS, statuses: [...SIMPLE_WORKFLOW], repository: null };
}

function sanitizeProjects(value: unknown): Record<string, ProjectSettings> {
	const projects: Record<string, ProjectSettings> = {};
	if (typeof value !== 'object' || value === null) return projects;
	for (const [name, raw] of Object.entries(value)) {
		const duplicate = Object.keys(projects).some((existing) => isSameProjectName(existing, name));
		if (isValidProjectName(name) && !duplicate) projects[name] = sanitizeProject(name, raw, projects);
	}
	return projects;
}

/** Invalid or already-used prefixes are replaced, since two projects must never share one. */
function sanitizeProject(name: string, raw: unknown, earlier: Readonly<Record<string, ProjectSettings>>): ProjectSettings {
	const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const fallback = defaultProjectSettings(name, earlier);
	const statuses = sanitizeStatuses(data.statuses);
	const prefix = typeof data.keyPrefix === 'string' ? data.keyPrefix : '';
	const prefixIsFree = isValidKeyPrefix(prefix) && !Object.values(earlier).some((other) => other.keyPrefix === prefix);
	return {
		keyPrefix: prefixIsFree ? prefix : fallback.keyPrefix,
		sprintLengthDays: sanitizeSprintLength(data.sprintLengthDays),
		statuses: findWorkflowProblems(statuses).length === 0 ? statuses : fallback.statuses,
		repository: sanitizeRepository(data.repository),
	};
}

/** A link that is missing anything it needs is dropped rather than half-kept. */
function sanitizeRepository(value: unknown): RepositoryLink | null {
	if (typeof value !== 'object' || value === null) return null;
	const data = value as Record<string, unknown>;
	const provider = Object.values(RepositoryProvider).find((candidate) => candidate === data.provider);
	const host = readString(data.host);
	const path = readString(data.path);
	if (!provider || !host || !path || !isValidRepositoryHost(host) || !isValidRepositoryPath(path)) return null;
	const secretId = readString(data.tokenSecretId);
	const pulledAt = readString(data.lastPulledAt);
	return {
		provider,
		host,
		path,
		tokenSecretId: secretId,
		includeClosed: data.includeClosed === true,
		lastPulledAt: pulledAt !== null && !Number.isNaN(Date.parse(pulledAt)) ? pulledAt : null,
	};
}

function sanitizeSprintLength(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_SPRINT_LENGTH_DAYS;
}

function sanitizeStatuses(value: unknown): StatusDefinition[] {
	if (!Array.isArray(value)) return [...SIMPLE_WORKFLOW];
	return value
		.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
		.map((item) => ({
			id: readString(item.id) ?? '',
			name: readString(item.name) ?? '',
			category: readEnum(Object.values(StatusCategory), item.category, StatusCategory.ToDo),
		}));
}

/**
 * Single owner of the live settings. Exposes the active project's settings to the rest of the plugin
 * through the {@link BoardConfig} and {@link BoardLocations} abstractions, so switching projects
 * changes what every use case reads and writes without them knowing about projects.
 */
export class SettingsStore implements BoardConfig, BoardLocations, ProjectRegistry {
	private current: ObsidiboardSettings;
	private readonly workflows = new Map<string, Workflow>();
	private readonly listeners = new Set<() => void>();

	constructor(
		initial: ObsidiboardSettings,
		private readonly persist: (settings: ObsidiboardSettings) => Promise<void>,
	) {
		this.current = initial;
	}

	get settings(): Readonly<ObsidiboardSettings> {
		return this.current;
	}

	/** Applies and saves settings that apply to every project. */
	update(changes: Partial<GeneralSettings>): Promise<void> {
		return this.commit({ ...this.current, ...changes });
	}

	configuredProjects(): ReadonlyMap<string, ProjectSettings> {
		return new Map(Object.entries(this.current.projects));
	}

	/**
	 * Adds the project or replaces its settings.
	 * @throws InvalidProjectNameError, InvalidWorkflowError (nothing is saved in either case).
	 */
	async saveProject(name: string, settings: ProjectSettings): Promise<void> {
		assertValidProjectName(name);
		this.workflowFor(settings); // rejects an invalid workflow before anything is stored
		this.workflows.delete(name);
		await this.commit({ ...this.current, projects: { ...this.current.projects, [name]: settings } });
	}

	/** @throws UnknownProjectError when the project has no settings yet. */
	async activate(name: string): Promise<void> {
		if (!hasProject(this.current.projects, name)) throw new UnknownProjectError(name);
		await this.commit({ ...this.current, activeProject: name });
	}

	async renameProject(oldName: string, newName: string): Promise<void> {
		const moved = hasProject(this.current.projects, oldName) ? this.current.projects[oldName] : undefined;
		if (!moved || oldName === newName) return;
		if (!isValidProjectName(newName)) return this.removeProject(oldName);
		const others = Object.entries(this.current.projects).filter(([name]) => name !== oldName);
		const projects = Object.fromEntries(others);
		if (!hasProject(projects, newName)) projects[newName] = moved;
		const activeProject = this.current.activeProject === oldName ? newName : this.current.activeProject;
		this.workflows.delete(oldName);
		this.workflows.delete(newName);
		await this.commit(this.withActiveProject(projects, activeProject));
	}

	async removeProject(name: string): Promise<void> {
		if (!hasProject(this.current.projects, name)) return;
		const projects = Object.fromEntries(Object.entries(this.current.projects).filter(([existing]) => existing !== name));
		const activeProject = this.current.activeProject === name ? (Object.keys(projects)[0] ?? DEFAULT_PROJECT_NAME) : this.current.activeProject;
		this.workflows.delete(name);
		await this.commit(this.withActiveProject(projects, activeProject));
	}

	/** Settings holding `projects`, with `activeProject` active and given default settings if it has none. */
	private withActiveProject(projects: Record<string, ProjectSettings>, activeProject: string): ObsidiboardSettings {
		if (!hasProject(projects, activeProject)) projects[activeProject] = defaultProjectSettings(activeProject, projects);
		return { ...this.current, projects, activeProject };
	}

	/** Replaces the active project's statuses. @throws InvalidWorkflowError, nothing is saved in that case. */
	saveStatuses(statuses: readonly StatusDefinition[]): Promise<void> {
		return this.saveProject(this.activeProject, { ...this.activeSettings, statuses: statuses.map((status) => ({ ...status })) });
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get activeProject(): string {
		return this.current.activeProject;
	}

	get keyPrefix(): string {
		return this.activeSettings.keyPrefix;
	}

	get sprintLengthDays(): number {
		return this.activeSettings.sprintLengthDays;
	}

	get workflow(): Workflow {
		return this.workflowFor(this.activeSettings, this.activeProject);
	}

	private get activeSettings(): ProjectSettings {
		const settings = hasProject(this.current.projects, this.activeProject) ? this.current.projects[this.activeProject] : undefined;
		if (!settings) throw new UnknownProjectError(this.activeProject);
		return settings;
	}

	private workflowFor(settings: ProjectSettings, cacheAs?: string): Workflow {
		const cached = cacheAs === undefined ? undefined : this.workflows.get(cacheAs);
		if (cached) return cached;
		const workflow = new Workflow(settings.statuses);
		if (cacheAs !== undefined) this.workflows.set(cacheAs, workflow);
		return workflow;
	}

	private async commit(next: ObsidiboardSettings): Promise<void> {
		this.current = next;
		await this.persist(next);
		this.listeners.forEach((listener) => listener());
	}

	private get locations(): BoardLocations {
		return locationsFor(this.current.projectsFolder, this.current.activeProject);
	}

	get projectsFolder(): string {
		return this.locations.projectsFolder;
	}

	get projectName(): string {
		return this.locations.projectName;
	}

	get boardFolder(): string {
		return this.locations.boardFolder;
	}

	get issuesFolder(): string {
		return this.locations.issuesFolder;
	}

	get sprintsFolder(): string {
		return this.locations.sprintsFolder;
	}

	get agentIndexPath(): string {
		return this.locations.agentIndexPath;
	}

	get agentGuidePath(): string {
		return this.locations.agentGuidePath;
	}
}
