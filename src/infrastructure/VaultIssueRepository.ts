import { IssueRepository } from '../application/ports';
import { IssueNotFoundError } from '../domain/errors';
import { Issue, IssueChanges, IssueLinks } from '../domain/issue';
import { isIssueKey } from '../domain/issueKey';
import { Workflow } from '../domain/workflow';
import { BoardLocations } from './boardLocations';
import { issueFrontmatter, readIssue, readLinks, SprintReference, writeIssueChanges, writeLinks } from './frontmatter/issueFrontmatter';
import { Frontmatter, toPathWikilink } from './frontmatter/values';
import { NoteRecord, VaultNoteStore } from './VaultNoteStore';

/** Issues stored as `<issuesFolder>/<KEY>.md`, with fields in frontmatter and the description as the body. */
export class VaultIssueRepository implements IssueRepository {
	private readonly parsed = new WeakMap<Frontmatter, { basename: string; fallbackStatus: string; issue: Issue }>();

	constructor(
		private readonly store: VaultNoteStore,
		private readonly locations: BoardLocations,
		private readonly workflow: () => Workflow,
	) {}

	/** Sprint notes are named "Sprint N" in every project, so links to them include the folder. */
	private readonly sprintReference: SprintReference = (sprintName) => toPathWikilink(this.locations.sprintsFolder, sprintName);

	findAll(): Issue[] {
		return this.store
			.list(this.locations.issuesFolder)
			.filter((note) => isIssueKey(note.basename))
			.map((note) => this.toIssue(note));
	}

	findByKey(key: string): Issue | null {
		if (!isIssueKey(key)) return null;
		const note = this.store.read(this.locations.issuesFolder, key);
		return note ? this.toIssue(note) : null;
	}

	exists(key: string): boolean {
		return this.store.file(this.locations.issuesFolder, key) !== null;
	}

	async create(issue: Issue, description: string): Promise<void> {
		await this.store.create(this.locations.issuesFolder, issue.key, issueFrontmatter(issue, this.sprintReference), description);
	}

	/** @throws IssueNotFoundError, YAMLParseError */
	async update(key: string, changes: IssueChanges): Promise<void> {
		const updated = await this.store.updateFrontmatter(this.locations.issuesFolder, key, (frontmatter) =>
			writeIssueChanges(frontmatter, changes, this.sprintReference),
		);
		if (!updated) throw new IssueNotFoundError(key);
	}

	/** @throws IssueNotFoundError, YAMLParseError */
	async updateLinks(key: string, change: (current: IssueLinks) => IssueLinks): Promise<void> {
		const updated = await this.store.updateFrontmatter(this.locations.issuesFolder, key, (frontmatter) =>
			writeLinks(frontmatter, change(readLinks(frontmatter))),
		);
		if (!updated) throw new IssueNotFoundError(key);
	}

	/**
	 * Parsing is skipped while Obsidian hands back the same cached frontmatter object for a note, so
	 * unchanged notes cost nothing on repeated board reads. The cache is dropped when a note's
	 * parsed frontmatter object, file name or the fallback status changes.
	 */
	private toIssue(note: NoteRecord): Issue {
		const fallbackStatus = this.workflow().initialStatus.id;
		const cached = this.parsed.get(note.frontmatter);
		if (cached && cached.basename === note.basename && cached.fallbackStatus === fallbackStatus) return cached.issue;
		const issue = readIssue(note.basename, note.frontmatter, fallbackStatus);
		this.parsed.set(note.frontmatter, { basename: note.basename, fallbackStatus, issue });
		return issue;
	}
}
