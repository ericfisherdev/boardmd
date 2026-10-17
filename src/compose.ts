import { App } from 'obsidian';
import { BoardQueries } from './application/BoardQueries';
import { IssueCommands } from './application/IssueCommands';
import { IssueEditCommands } from './application/IssueEditCommands';
import { IssueLinkCommands } from './application/IssueLinkCommands';
import { IssuePullCommands } from './application/IssuePullCommands';
import { Clock, WorkSettler } from './application/ports';
import { ProjectCommands } from './application/ProjectCommands';
import { RepositoryLinkCommands } from './application/RepositoryLinkCommands';
import { SprintCommands } from './application/SprintCommands';
import { WorkflowCommands } from './application/WorkflowCommands';
import { AgentFilesSync } from './infrastructure/agent/AgentFilesSync';
import { AgentFilesWriter } from './infrastructure/agent/AgentFilesWriter';
import { RepositoryProvider } from './domain/repository';
import { IndexingTracker } from './infrastructure/IndexingTracker';
import { ObsidianHttpClient } from './infrastructure/repositories/ObsidianHttpClient';
import { GitHubIssueSource, GitLabIssueSource, RepositoryIssueSources } from './infrastructure/repositories/RepositoryIssueSources';
import { SecretStorageTokens } from './infrastructure/SecretStorageTokens';
import { ProjectFolderWatcher } from './infrastructure/ProjectFolderWatcher';
import { SystemClock } from './infrastructure/SystemClock';
import { VaultChangeFeed } from './infrastructure/VaultChangeFeed';
import { VaultIssueRepository } from './infrastructure/VaultIssueRepository';
import { VaultNoteStore } from './infrastructure/VaultNoteStore';
import { VaultProjectFolders } from './infrastructure/VaultProjectFolders';
import { VaultSprintRepository } from './infrastructure/VaultSprintRepository';
import { IssueNavigator, WorkspaceIssueNavigator } from './infrastructure/WorkspaceIssueNavigator';
import { SettingsStore } from './settings/settings';
import { IssueDialogs } from './ui/IssueDialogs';
import { IssueMenu } from './ui/IssueMenu';
import { IssueNoteEditAction } from './ui/IssueNoteEditAction';
import { IssuePullAction } from './ui/IssuePullAction';
import { ProjectDialogs } from './ui/ProjectDialogs';
import { SprintDialogs } from './ui/SprintDialogs';

export interface BoardServices {
	readonly clock: Clock;
	readonly feed: VaultChangeFeed;
	readonly indexing: IndexingTracker;
	readonly agentFiles: AgentFilesSync;
	readonly projectFolders: ProjectFolderWatcher;
	readonly queries: BoardQueries;
	readonly issueCommands: IssueCommands;
	readonly sprintCommands: SprintCommands;
	readonly linkCommands: IssueLinkCommands;
	readonly workflowCommands: WorkflowCommands;
	readonly navigator: IssueNavigator;
	readonly issueDialogs: IssueDialogs;
	readonly sprintDialogs: SprintDialogs;
	readonly menu: IssueMenu;
	readonly projects: ProjectCommands;
	readonly repositoryLink: RepositoryLinkCommands;
	readonly issuePullAction: IssuePullAction;
	readonly projectDialogs: ProjectDialogs;
	readonly noteEditAction: IssueNoteEditAction;
}

/** Composition root: builds every collaborator once and injects it where it is needed. */
export function composeBoard(app: App, settings: SettingsStore): BoardServices {
	const clock = new SystemClock();
	const indexing = new IndexingTracker(app.metadataCache);
	const feed = new VaultChangeFeed(app.vault, app.metadataCache, settings);
	const store = new VaultNoteStore(app.vault, app.metadataCache, app.fileManager, indexing);
	const issues = new VaultIssueRepository(store, settings, () => settings.workflow);
	const sprints = new VaultSprintRepository(store, settings);
	const queries = new BoardQueries(issues, sprints, settings);
	const issueCommands = new IssueCommands(issues, sprints, settings, clock);
	const sprintCommands = new SprintCommands(sprints, issues, settings, clock);
	const linkCommands = new IssueLinkCommands(issues);
	const navigator = new WorkspaceIssueNavigator(app.workspace, store, settings);
	const editCommands = new IssueEditCommands(issues, issueCommands, linkCommands);
	const issueDialogs = new IssueDialogs(app, queries, issueCommands, linkCommands, editCommands, indexing);
	const http = new ObsidianHttpClient();
	const remoteIssues = new RepositoryIssueSources({
		[RepositoryProvider.GitHub]: new GitHubIssueSource(http),
		[RepositoryProvider.GitLab]: new GitLabIssueSource(http),
	});
	const issuePull = new IssuePullCommands(issues, sprints, settings, clock, settings, remoteIssues, new SecretStorageTokens(app.secretStorage), indexing);
	const agentWriter = new AgentFilesWriter(store, issues, sprints, settings, settings);
	const agentFiles = new AgentFilesSync(agentWriter, () => settings.settings.writeAgentFiles);
	const pendingWork: WorkSettler = {
		settle: async () => {
			await indexing.whenSettled();
			await agentFiles.flush();
		},
	};
	const projects = new ProjectCommands(settings, new VaultProjectFolders(app.vault, store, settings), pendingWork);
	return {
		clock,
		feed,
		indexing,
		agentFiles,
		projectFolders: new ProjectFolderWatcher(app.vault, settings, settings),
		queries,
		issueCommands,
		sprintCommands,
		linkCommands,
		workflowCommands: new WorkflowCommands(settings, issues),
		navigator,
		issueDialogs,
		sprintDialogs: new SprintDialogs(app, queries, sprintCommands),
		menu: new IssueMenu(navigator, issueDialogs),
		projects,
		repositoryLink: new RepositoryLinkCommands(settings),
		issuePullAction: new IssuePullAction(issuePull),
		projectDialogs: new ProjectDialogs(app, projects),
		noteEditAction: new IssueNoteEditAction(app, settings, issueDialogs, feed),
	};
}
