import { BoardConfig, Clock, IssueRepository, SprintRepository } from '../src/application/ports';
import { IssueNotFoundError, SprintNotFoundError } from '../src/domain/errors';
import { emptyIssueLinks, Issue, IssueChanges, IssueLinks, IssuePriority, IssueType } from '../src/domain/issue';
import { Sprint, SprintChanges, SprintState } from '../src/domain/sprint';
import { SIMPLE_WORKFLOW, StatusDefinition, Workflow } from '../src/domain/workflow';

export class InMemoryIssueRepository implements IssueRepository {
	readonly descriptions = new Map<string, string>();
	private readonly issues = new Map<string, Issue>();

	constructor(initial: Issue[] = []) {
		initial.forEach((issue) => this.issues.set(issue.key, issue));
	}

	/** Fresh objects per read, like the vault-backed repository, so identity is never a valid comparison. */
	findAll(): Issue[] {
		return [...this.issues.values()].map(copyOf);
	}

	findByKey(key: string): Issue | null {
		const issue = this.issues.get(key);
		return issue ? copyOf(issue) : null;
	}

	exists(key: string): boolean {
		return this.issues.has(key);
	}

	async create(issue: Issue, description: string): Promise<void> {
		this.issues.set(issue.key, issue);
		this.descriptions.set(issue.key, description);
	}

	async update(key: string, changes: IssueChanges): Promise<void> {
		const issue = this.issues.get(key);
		if (!issue) throw new IssueNotFoundError(key);
		this.issues.set(key, { ...issue, ...changes });
	}

	async updateLinks(key: string, change: (current: IssueLinks) => IssueLinks): Promise<void> {
		const issue = this.issues.get(key);
		if (!issue) throw new IssueNotFoundError(key);
		this.issues.set(key, { ...issue, links: change(issue.links) });
	}

	get(key: string): Issue {
		const issue = this.issues.get(key);
		if (!issue) throw new Error(`missing ${key}`);
		return issue;
	}
}

/**
 * Reads come from a snapshot that only catches up when `settle()` is called, like Obsidian's
 * metadata cache lagging behind writes. Writes always apply to the live state.
 */
export class LaggingIssueRepository extends InMemoryIssueRepository {
	private snapshot: Issue[];
	private readonly updateCalls: string[] = [];

	constructor(initial: Issue[] = []) {
		super(initial);
		this.snapshot = super.findAll();
	}

	/** Keys of the notes written, in order, one entry per write. */
	get writes(): readonly string[] {
		return this.updateCalls;
	}

	settle(): void {
		this.snapshot = super.findAll();
	}

	findAll(): Issue[] {
		return this.snapshot.map(copyOf);
	}

	findByKey(key: string): Issue | null {
		const issue = this.snapshot.find((candidate) => candidate.key === key);
		return issue ? copyOf(issue) : null;
	}

	async update(key: string, changes: IssueChanges): Promise<void> {
		this.updateCalls.push(key);
		await super.update(key, changes);
	}

	async updateLinks(key: string, change: (current: IssueLinks) => IssueLinks): Promise<void> {
		this.updateCalls.push(key);
		await super.updateLinks(key, change);
	}
}

function copyOf(issue: Issue): Issue {
	return { ...issue, links: { ...issue.links } };
}

export class InMemorySprintRepository implements SprintRepository {
	private readonly sprints = new Map<string, Sprint>();

	constructor(initial: Sprint[] = []) {
		initial.forEach((sprint) => this.sprints.set(sprint.name, sprint));
	}

	findAll(): Sprint[] {
		return [...this.sprints.values()].map((sprint) => ({ ...sprint }));
	}

	findByName(name: string): Sprint | null {
		const sprint = this.sprints.get(name);
		return sprint ? { ...sprint } : null;
	}

	async create(sprint: Sprint): Promise<void> {
		this.sprints.set(sprint.name, sprint);
	}

	async update(name: string, changes: SprintChanges): Promise<void> {
		const sprint = this.sprints.get(name);
		if (!sprint) throw new SprintNotFoundError(name);
		this.sprints.set(name, { ...sprint, ...changes });
	}

	get(name: string): Sprint {
		const sprint = this.sprints.get(name);
		if (!sprint) throw new Error(`missing ${name}`);
		return sprint;
	}
}

export class FixedClock implements Clock {
	constructor(private readonly date: string) {}

	today(): string {
		return this.date;
	}

	timestamp(): string {
		return `${this.date}T12:00:00.000Z`;
	}
}

export function config(statuses: readonly StatusDefinition[] = SIMPLE_WORKFLOW): BoardConfig {
	return { keyPrefix: 'OB', sprintLengthDays: 14, workflow: new Workflow(statuses) };
}

export function anIssue(key: string, overrides: Partial<Issue> = {}): Issue {
	return {
		key,
		summary: `Summary of ${key}`,
		type: IssueType.Task,
		status: 'todo',
		priority: IssuePriority.Medium,
		points: null,
		sprint: null,
		rank: 1000,
		assignee: null,
		parent: null,
		links: emptyIssueLinks(),
		created: '2026-10-01',
		resolved: null,
		source: null,
		...overrides,
	};
}

export function aSprint(name: string, overrides: Partial<Sprint> = {}): Sprint {
	return {
		name,
		state: SprintState.Future,
		sequence: 1,
		startDate: null,
		endDate: null,
		goal: '',
		committedPoints: null,
		outcome: null,
		...overrides,
	};
}
