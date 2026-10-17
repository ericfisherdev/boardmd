import { BacklogModel, BoardModel, buildBacklog, buildBoard } from '../domain/boardModels';
import { Issue } from '../domain/issue';
import { IssueGraph } from '../domain/issueGraph';
import { Sprint } from '../domain/sprint';
import { Workflow } from '../domain/workflow';

/**
 * The board as it was at one moment: issues and sprints read once, so everything a screen
 * derives from them (lists, links, parents) agrees and the vault is scanned a single time.
 */
export class BoardSnapshot {
	readonly graph: IssueGraph;
	private readonly issuesByKey: ReadonlyMap<string, Issue>;

	constructor(
		readonly issues: readonly Issue[],
		readonly sprints: readonly Sprint[],
		readonly workflow: Workflow,
	) {
		this.graph = new IssueGraph(issues);
		this.issuesByKey = new Map(issues.map((issue) => [issue.key, issue]));
	}

	issue(key: string): Issue | null {
		return this.issuesByKey.get(key) ?? null;
	}

	backlog(): BacklogModel {
		return buildBacklog(this.issues, this.sprints, this.workflow);
	}

	activeBoard(): BoardModel | null {
		return buildBoard(this.issues, this.sprints, this.workflow);
	}
}
