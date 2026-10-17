import { issuesInContainer } from '../domain/boardModels';
import {
	MissingTokenError,
	NoRepositoryLinkedError,
	PullInProgressError,
	PullInterruptedError,
	UnknownProjectError,
} from '../domain/errors';
import { emptyIssueLinks, Issue } from '../domain/issue';
import { nextFreeKeys } from '../domain/issueKey';
import { ImportPlan, IssueToCreate, planImport } from '../domain/importPlan';
import { RANK_STEP, rankAfterLast } from '../domain/ranking';
import { RepositoryLink } from '../domain/repository';
import { BoardConfig, Clock, IssueRepository, ProjectRegistry, RemoteIssueSource, SprintReader, TokenStore, WriteSettlement } from './ports';

export interface PullSummary {
	readonly created: number;
	readonly updated: number;
	readonly unchanged: number;
}

/** Issues changed shortly before the last pull are asked for again, in case clocks differ. */
const OVERLAP_MS = 5 * 60 * 1000;

/** Pulls issues from the active project's linked repository into the project's issue notes. */
export class IssuePullCommands {
	private pulling = false;

	constructor(
		private readonly issues: IssueRepository,
		private readonly sprints: SprintReader,
		private readonly config: BoardConfig,
		private readonly clock: Clock,
		private readonly registry: ProjectRegistry,
		private readonly source: RemoteIssueSource,
		private readonly tokens: TokenStore,
		private readonly settlement: WriteSettlement,
	) {}

	/**
	 * New repository issues become backlog issues; ones pulled before get the repository's title,
	 * assignee and open/closed state (see {@link planImport}). Stops without recording the pull
	 * if the board switches to another project meanwhile.
	 * @throws NoRepositoryLinkedError, MissingTokenError, PullInProgressError, PullInterruptedError,
	 *   RepositoryRequestError, RepositoryTooLargeError
	 */
	async pull(): Promise<PullSummary> {
		if (this.pulling) throw new PullInProgressError();
		this.pulling = true;
		try {
			return await this.pullActiveProject();
		} finally {
			this.pulling = false;
		}
	}

	private async pullActiveProject(): Promise<PullSummary> {
		const project = this.registry.activeProject;
		const link = this.registry.configuredProjects().get(project)?.repository;
		if (!link) throw new NoRepositoryLinkedError(project);
		const startedAt = this.clock.timestamp();
		const remote = await this.source.fetchIssues({
			link,
			token: this.tokenFor(link),
			state: link.lastPulledAt === null && !link.includeClosed ? 'open' : 'all',
			updatedSince: link.lastPulledAt === null ? null : withOverlap(link.lastPulledAt),
		});
		this.assertActive(project);
		await this.settlement.whenSettled(); // a pull right after another must see the issues it created
		const local = this.issues.findAll();
		const plan = planImport({ remote, local, link, workflow: this.config.workflow, today: this.clock.today() });
		await this.apply(project, plan, local);
		await this.recordPull(project, startedAt);
		await this.settlement.whenSettled();
		return { created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged };
	}

	private tokenFor(link: RepositoryLink): string | null {
		if (link.tokenSecretId === null) return null;
		const token = this.tokens.tokenFor(link.tokenSecretId);
		if (token === null || token === '') throw new MissingTokenError(link.tokenSecretId);
		return token;
	}

	private async apply(project: string, plan: ImportPlan, local: readonly Issue[]): Promise<void> {
		for (const { key, changes } of plan.update) {
			this.assertActive(project);
			await this.issues.update(key, changes);
		}
		const keys = nextFreeKeys(
			this.config.keyPrefix,
			local.map((issue) => issue.key),
			(candidate) => this.issues.exists(candidate),
			plan.create.length,
		);
		let rank = rankAfterLast(issuesInContainer(local, this.sprints.findAll(), this.config.workflow, null));
		for (const [index, spec] of plan.create.entries()) {
			this.assertActive(project);
			const key = keys[index];
			if (key === undefined) throw new Error('Fewer issue keys than issues to create.');
			await this.issues.create(this.newIssue(key, spec, rank), spec.description);
			rank += RANK_STEP;
		}
	}

	private newIssue(key: string, spec: IssueToCreate, rank: number): Issue {
		return {
			key,
			summary: spec.summary,
			type: spec.type,
			status: spec.status,
			priority: spec.priority,
			points: null,
			sprint: null,
			rank,
			assignee: spec.assignee,
			parent: null,
			links: emptyIssueLinks(),
			created: this.clock.today(),
			resolved: spec.resolved,
			source: spec.source,
		};
	}

	/** @throws PullInterruptedError */
	private assertActive(project: string): void {
		if (this.registry.activeProject !== project) throw new PullInterruptedError(project);
	}

	private async recordPull(project: string, startedAt: string): Promise<void> {
		const settings = this.registry.configuredProjects().get(project);
		if (!settings) throw new UnknownProjectError(project);
		if (!settings.repository) return;
		await this.registry.saveProject(project, { ...settings, repository: { ...settings.repository, lastPulledAt: startedAt } });
	}
}

/** `YYYY-MM-DDTHH:MM:SSZ`, five minutes before the given timestamp. */
function withOverlap(timestamp: string): string {
	return new Date(Date.parse(timestamp) - OVERLAP_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
