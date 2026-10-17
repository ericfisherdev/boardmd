import { BacklogModel, BoardModel, buildBacklog, buildBoard, plannedSprints } from '../domain/boardModels';
import { Issue } from '../domain/issue';
import { IssueGraph } from '../domain/issueGraph';
import { Sprint, SprintState } from '../domain/sprint';
import { Workflow } from '../domain/workflow';
import { BoardSnapshot } from './BoardSnapshot';
import { BoardConfig, IssueReader, SprintReader } from './ports';

/** Read-only views of the board for the UI and the agent index. */
export class BoardQueries {
	constructor(
		private readonly issues: IssueReader,
		private readonly sprints: SprintReader,
		private readonly config: BoardConfig,
	) {}

	get workflow(): Workflow {
		return this.config.workflow;
	}

	/** One consistent read of the whole board; use it when a screen needs several derived views. */
	snapshot(): BoardSnapshot {
		return new BoardSnapshot(this.issues.findAll(), this.sprints.findAll(), this.config.workflow);
	}

	backlog(): BacklogModel {
		return buildBacklog(this.issues.findAll(), this.sprints.findAll(), this.config.workflow);
	}

	activeBoard(): BoardModel | null {
		return buildBoard(this.issues.findAll(), this.sprints.findAll(), this.config.workflow);
	}

	graph(): IssueGraph {
		return new IssueGraph(this.issues.findAll());
	}

	issue(key: string): Issue | null {
		return this.issues.findByKey(key);
	}

	allIssues(): Issue[] {
		return this.issues.findAll();
	}

	allSprints(): Sprint[] {
		return this.sprints.findAll();
	}

	/** Sprints issues can be planned into: the active sprint first, then planned sprints. */
	openSprints(): Sprint[] {
		const sprints = this.sprints.findAll();
		const active = sprints.filter((sprint) => sprint.state === SprintState.Active);
		return [...active, ...plannedSprints(sprints)];
	}

	plannedSprints(): Sprint[] {
		return plannedSprints(this.sprints.findAll());
	}
}
