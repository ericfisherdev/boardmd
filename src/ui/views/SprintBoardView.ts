import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { BoardQueries } from '../../application/BoardQueries';
import { IssueCommands } from '../../application/IssueCommands';
import { ChangeFeed, Clock } from '../../application/ports';
import { BoardColumn, BoardModel } from '../../domain/boardModels';
import { daysBetween } from '../../domain/calendarDate';
import { Issue, totalPoints } from '../../domain/issue';
import { Sprint } from '../../domain/sprint';
import { StatusCategory } from '../../domain/workflow';
import { IssueNavigator } from '../../infrastructure/WorkspaceIssueNavigator';
import { ProjectCommands } from '../../application/ProjectCommands';
import { IssueItemActions, IssueItemModel, renderIssueCard } from '../components/issueItem';
import { IssueItemCache } from '../components/IssueItemCache';
import { ProjectSwitcher } from '../components/ProjectSwitcher';
import { makeIssueDropList } from '../dragAndDrop';
import { IssueDialogs } from '../IssueDialogs';
import { IssueMenu } from '../IssueMenu';
import { pointsLabel } from '../labels';
import { ProjectDialogs } from '../ProjectDialogs';
import { runReporting } from '../reportError';
import { SprintDialogs } from '../SprintDialogs';
import {
	BoardViewOpener,
	issueItemActions,
	itemModelFactory,
	keepScroll,
	matchesFilter,
	renderLive,
	runDrop,
	SPRINT_BOARD_VIEW_TYPE,
} from './viewSupport';

export interface SprintBoardViewDependencies {
	readonly queries: BoardQueries;
	readonly issueCommands: IssueCommands;
	readonly issueDialogs: IssueDialogs;
	readonly sprintDialogs: SprintDialogs;
	readonly menu: IssueMenu;
	readonly projects: ProjectCommands;
	readonly projectDialogs: ProjectDialogs;
	readonly navigator: IssueNavigator;
	readonly feed: ChangeFeed;
	readonly opener: BoardViewOpener;
	readonly clock: Clock;
}

/** Kanban board of the active sprint; columns follow the configured workflow. */
export class SprintBoardView extends ItemView {
	private filter = '';
	private bodyEl: HTMLElement | null = null;
	private projectSwitcher: ProjectSwitcher | null = null;
	private refresh: () => void = () => undefined;
	private readonly actions: IssueItemActions;
	private readonly cards: IssueItemCache;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: SprintBoardViewDependencies,
	) {
		super(leaf);
		this.actions = issueItemActions(deps.navigator, deps.menu, deps.issueDialogs);
		this.cards = new IssueItemCache((parent, model) => renderIssueCard(parent, model, this.actions));
	}

	getViewType(): string {
		return SPRINT_BOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Sprint board';
	}

	getIcon(): string {
		return 'kanban';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('obsidiboard-view', 'obsidiboard-board');
		this.renderToolbar(this.contentEl);
		this.bodyEl = this.contentEl.createDiv({ cls: 'obsidiboard-board-body' });
		this.refresh = renderLive(this, this.contentEl, this.deps.feed, () => this.renderBody());
	}

	async onClose(): Promise<void> {
		this.cards.clear();
		this.contentEl.empty();
		this.bodyEl = null;
		this.projectSwitcher = null;
	}

	private renderToolbar(parent: HTMLElement): void {
		const toolbar = parent.createDiv({ cls: 'obsidiboard-toolbar' });
		toolbar.createEl('h2', { text: 'Sprint board' });
		this.projectSwitcher = new ProjectSwitcher(toolbar, this.deps.projects, this.deps.projectDialogs);
		const search = toolbar.createEl('input', {
			type: 'search',
			cls: 'obsidiboard-filter',
			attr: { placeholder: 'Filter issues', 'aria-label': 'Filter issues' },
		});
		search.addEventListener('input', () => {
			this.filter = search.value;
			this.refresh();
		});
		toolbar.createSpan({ cls: 'obsidiboard-spacer' });
		const create = toolbar.createEl('button', { cls: 'mod-cta' });
		setIcon(create.createSpan({ cls: 'obsidiboard-button-icon' }), 'plus');
		create.createSpan({ text: 'Create issue' });
		create.addEventListener('click', () => this.deps.issueDialogs.create(this.deps.queries.activeBoard()?.sprint.name ?? null));
		const backlog = toolbar.createEl('button');
		setIcon(backlog.createSpan({ cls: 'obsidiboard-button-icon' }), 'list-todo');
		backlog.createSpan({ text: 'Backlog' });
		backlog.addEventListener('click', () => runReporting(() => this.deps.opener.openBacklog()));
	}

	private renderBody(): void {
		const body = this.bodyEl;
		if (!body) return;
		this.projectSwitcher?.sync();
		const snapshot = this.deps.queries.snapshot();
		const board = snapshot.activeBoard();
		body.empty();
		if (board) this.renderBoard(body, board, itemModelFactory(snapshot));
		else this.renderNoActiveSprint(body);
		this.cards.keepOnly(new Set(snapshot.issues.map((issue) => issue.key)));
	}

	private renderBoard(body: HTMLElement, board: BoardModel, toItem: (issue: Issue) => IssueItemModel): void {
		this.renderSprintHeader(body, board);
		const columns = body.createDiv({ cls: 'obsidiboard-columns' });
		keepScroll(columns, 'columns');
		board.columns.forEach((column) => this.renderColumn(columns, column, toItem));
	}

	private renderSprintHeader(body: HTMLElement, { sprint, columns }: BoardModel): void {
		const header = body.createDiv({ cls: 'obsidiboard-sprint-header' });
		const titleBlock = header.createDiv();
		titleBlock.createEl('h3', { text: sprint.name });
		if (sprint.goal) titleBlock.createDiv({ cls: 'obsidiboard-goal', text: sprint.goal });
		const issues = columns.flatMap((column) => column.issues);
		const done = columns.filter((c) => c.status.category === StatusCategory.Done).flatMap((c) => c.issues);
		const facts = header.createDiv({ cls: 'obsidiboard-muted obsidiboard-sprint-facts' });
		facts.createSpan({ text: this.scheduleText(sprint) });
		facts.createSpan({ text: `${pointsLabel(totalPoints(done))} of ${pointsLabel(totalPoints(issues))} done` });
		const complete = header.createEl('button', { cls: 'mod-cta', text: 'Complete sprint' });
		complete.addEventListener('click', () => this.deps.sprintDialogs.complete(sprint.name));
	}

	private scheduleText(sprint: Sprint): string {
		if (!sprint.endDate) return 'No end date';
		const remaining = daysBetween(this.deps.clock.today(), sprint.endDate);
		if (remaining < 0) return `Ended ${sprint.endDate} (${-remaining} days ago)`;
		return `Ends ${sprint.endDate} · ${remaining} ${remaining === 1 ? 'day' : 'days'} left`;
	}

	private renderColumn(parent: HTMLElement, column: BoardColumn, toItem: (issue: Issue) => IssueItemModel): void {
		const { status } = column;
		const columnEl = parent.createDiv({ cls: `obsidiboard-column obsidiboard-column-${status.category}` });
		const header = columnEl.createDiv({ cls: 'obsidiboard-column-header' });
		header.createSpan({ text: status.name });
		header.createSpan({ cls: 'obsidiboard-count', text: String(column.issues.length) });
		const list = columnEl.createDiv({ cls: 'obsidiboard-column-list' });
		keepScroll(list, `column-${status.id}`);
		makeIssueDropList(list, (key, beforeKey) =>
			runDrop(() => this.deps.issueCommands.placeOnBoard(key, status.id, beforeKey), () => this.refresh()),
		);
		column.issues
			.filter((issue) => matchesFilter(issue, this.filter))
			.forEach((issue) => this.cards.attach(list, toItem(issue)));
	}

	private renderNoActiveSprint(body: HTMLElement): void {
		const empty = body.createDiv({ cls: 'obsidiboard-empty-state' });
		empty.createEl('h3', { text: 'No active sprint' });
		empty.createEl('p', { text: 'Plan issues into a sprint from the backlog, then start it.' });
		const open = empty.createEl('button', { cls: 'mod-cta', text: 'Open backlog' });
		open.addEventListener('click', () => runReporting(() => this.deps.opener.openBacklog()));
	}
}
