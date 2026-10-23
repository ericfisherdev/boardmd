import { Plugin, WorkspaceLeaf } from 'obsidian';
import { BoardServices, composeBoard } from './compose';
import { SettingsStore, sanitizeSettings } from './settings/settings';
import { BoardMdSettingTab } from './settings/SettingsTab';
import { runReporting } from './ui/reportError';
import { BacklogView } from './ui/views/BacklogView';
import { SprintBoardView } from './ui/views/SprintBoardView';
import { BACKLOG_VIEW_TYPE, BoardViewOpener, SPRINT_BOARD_VIEW_TYPE } from './ui/views/viewSupport';

export default class BoardMdPlugin extends Plugin implements BoardViewOpener {
	async onload(): Promise<void> {
		const settings = new SettingsStore(sanitizeSettings(await this.loadData()), (data) => this.saveData(data));
		const board = composeBoard(this.app, settings);

		board.feed.attachTo(this);
		board.indexing.attachTo(this);
		board.projectFolders.attachTo(this);
		this.register(board.feed.subscribe(() => board.agentFiles.requestIndex()));
		this.register(
			settings.onChange(() => {
				board.agentFiles.requestGuide();
				board.feed.refresh();
			}),
		);
		this.register(() => board.agentFiles.cancel());

		board.noteEditAction.attachTo(this);
		this.registerViews(board);
		this.registerCommands(board);
		this.addRibbonIcon('list-todo', 'Open backlog', () => runReporting(() => this.openBacklog()));
		this.addRibbonIcon('kanban', 'Open sprint board', () => runReporting(() => this.openSprintBoard()));
		this.addSettingTab(new BoardMdSettingTab(this.app, this, settings, board.workflowCommands, board.projects, board.projectDialogs, board.repositoryLink, board.issuePullAction));

		// The metadata cache is only complete once the workspace is ready.
		this.app.workspace.onLayoutReady(() => {
			board.agentFiles.requestGuide();
			board.feed.refresh();
		});
	}

	openBacklog(): Promise<void> {
		return this.reveal(BACKLOG_VIEW_TYPE);
	}

	openSprintBoard(): Promise<void> {
		return this.reveal(SPRINT_BOARD_VIEW_TYPE);
	}

	private registerViews(board: BoardServices): void {
		const shared = {
			queries: board.queries,
			issueCommands: board.issueCommands,
			issueDialogs: board.issueDialogs,
			sprintDialogs: board.sprintDialogs,
			menu: board.menu,
			projects: board.projects,
			projectDialogs: board.projectDialogs,
			issuePullAction: board.issuePullAction,
			navigator: board.navigator,
			feed: board.feed,
			opener: this,
		};
		this.registerView(
			BACKLOG_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new BacklogView(leaf, shared),
		);
		this.registerView(
			SPRINT_BOARD_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new SprintBoardView(leaf, { ...shared, clock: board.clock }),
		);
	}

	private registerCommands(board: BoardServices): void {
		this.addCommand({ id: 'open-backlog', name: 'Open backlog', callback: () => runReporting(() => this.openBacklog()) });
		this.addCommand({ id: 'open-sprint-board', name: 'Open sprint board', callback: () => runReporting(() => this.openSprintBoard()) });
		this.addCommand({ id: 'create-issue', name: 'Create issue', callback: () => board.issueDialogs.create() });
		this.addCommand({ id: 'switch-project', name: 'Switch project', callback: () => board.projectDialogs.switchProject() });
		this.addCommand({ id: 'create-project', name: 'Create project', callback: () => board.projectDialogs.create() });
		this.addCommand({ id: 'pull-issues', name: 'Pull issues from linked repository', callback: () => board.issuePullAction.run() });
		this.addCommand({ id: 'create-sprint', name: 'Create sprint', callback: () => board.sprintDialogs.create() });
	}

	private async reveal(viewType: string): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(viewType)[0];
		const leaf = existing ?? workspace.getLeaf('tab');
		if (!existing) await leaf.setViewState({ type: viewType, active: true });
		await workspace.revealLeaf(leaf);
	}
}
