import { Issue, IssueChanges, IssueLinks } from '../domain/issue';
import { ProjectSettings } from '../domain/project';
import { RemoteIssue, RepositoryLink } from '../domain/repository';
import { Sprint, SprintChanges } from '../domain/sprint';
import { Workflow } from '../domain/workflow';

export interface IssueReader {
	findAll(): Issue[];
	findByKey(key: string): Issue | null;
}

export interface IssueWriter {
	/** Whether a note already exists for the key, even if the metadata cache has not indexed it yet. */
	exists(key: string): boolean;
	create(issue: Issue, description: string): Promise<void>;
	/** @throws IssueNotFoundError when no note exists for the key. */
	update(key: string, changes: IssueChanges): Promise<void>;
	/**
	 * Rewrites the issue's links from the note's content at write time, not from an earlier read, so
	 * back-to-back link changes to one note never overwrite each other.
	 * @throws IssueNotFoundError when no note exists for the key.
	 */
	updateLinks(key: string, change: (current: IssueLinks) => IssueLinks): Promise<void>;
}

export type IssueRepository = IssueReader & IssueWriter;

export interface SprintReader {
	findAll(): Sprint[];
	findByName(name: string): Sprint | null;
}

export interface SprintWriter {
	create(sprint: Sprint): Promise<void>;
	/** @throws SprintNotFoundError when no note exists for the name. */
	update(name: string, changes: SprintChanges): Promise<void>;
}

export type SprintRepository = SprintReader & SprintWriter;

export interface Clock {
	/** Today's local date as YYYY-MM-DD. */
	today(): string;
	/** The current moment as a UTC ISO 8601 timestamp. */
	timestamp(): string;
}

/** Live, user-configurable settings the use cases depend on. */
export interface BoardConfig {
	readonly keyPrefix: string;
	readonly sprintLengthDays: number;
	readonly workflow: Workflow;
}

/** The projects the plugin has settings for, and which one the board currently shows. */
export interface ProjectRegistry {
	readonly activeProject: string;
	/** Settings of every configured project, by name. */
	configuredProjects(): ReadonlyMap<string, ProjectSettings>;
	/** Adds the project or replaces its settings. */
	saveProject(name: string, settings: ProjectSettings): Promise<void>;
	/** Makes a configured project the one the board shows. */
	activate(name: string): Promise<void>;
	/** Moves a project's settings to a new name (its folder was renamed); the active project follows. */
	renameProject(oldName: string, newName: string): Promise<void>;
	/** Forgets a project's settings (its folder is gone); if it was active, another project becomes active. */
	removeProject(name: string): Promise<void>;
}

/** The project folders in the vault. */
export interface ProjectFolders {
	/** Names of the project folders that exist. */
	list(): string[];
	/** Creates the project's folder with its issue and sprint subfolders. */
	create(name: string): Promise<void>;
	/** File names (without extension) of the notes in the project's issues folder. */
	issueNoteNames(name: string): string[];
}

/** Lets pending work on the active project finish, so a switch cannot send it to another project. */
export interface WorkSettler {
	settle(): Promise<void>;
}

export interface RemoteIssueQuery {
	readonly link: RepositoryLink;
	/** Access token, or null to read public issues without signing in. */
	readonly token: string | null;
	readonly state: 'open' | 'all';
	/** ISO timestamp; only issues updated at or after it are returned. */
	readonly updatedSince: string | null;
}

/** Reads issues from a hosted repository (GitHub, GitLab). */
export interface RemoteIssueSource {
	/**
	 * @throws RepositoryRequestError, RepositoryTooLargeError
	 */
	fetchIssues(query: RemoteIssueQuery): Promise<RemoteIssue[]>;
}

/** Looks up access tokens kept in a secret store. */
export interface TokenStore {
	/** The secret's value, or null when no secret has that name. */
	tokenFor(secretId: string): string | null;
}

/** Lets a caller wait until the notes it wrote are visible to later reads. */
export interface WriteSettlement {
	/** Resolves once earlier writes are readable, or after a bounded wait. */
	whenSettled(): Promise<void>;
}

export interface ChangeFeed {
	/** Calls the listener after board data changes; returns an unsubscribe function. */
	subscribe(listener: () => void): () => void;
}
