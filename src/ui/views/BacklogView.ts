import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { BoardQueries } from '../../application/BoardQueries';
import { BoardSnapshot } from '../../application/BoardSnapshot';
import { IssueCommands } from '../../application/IssueCommands';
import { ChangeFeed } from '../../application/ports';
import { SprintSection } from '../../domain/boardModels';
import { Issue, totalPoints } from '../../domain/issue';
import { Sprint, SprintState } from '../../domain/sprint';
import { IssueNavigator } from '../../infrastructure/WorkspaceIssueNavigator';
import { ProjectCommands } from '../../application/ProjectCommands';
import { IssueItemActions, IssueItemModel, renderIssueRow } from '../components/issueItem';
import { IssueItemCache } from '../components/IssueItemCache';
import { ProjectSwitcher } from '../components/ProjectSwitcher';
import { makeIssueDropList } from '../dragAndDrop';
import { IssueDialogs } from '../IssueDialogs';
import { IssueMenu } from '../IssueMenu';
import { IssuePullAction } from '../IssuePullAction';
import { pointsLabel, SPRINT_STATE_LABEL } from '../labels';
import { ProjectDialogs } from '../ProjectDialogs';
import { runReporting } from '../reportError';
import { SprintDialogs } from '../SprintDialogs';
import {
	BACKLOG_VIEW_TYPE,
	BoardViewOpener,
	issueItemActions,
	itemModelFactory,
	keepScroll,
	matchesFilter,
	renderLive,
	runDrop,
} from './viewSupport';

export interface BacklogViewDependencies {
	readonly queries: BoardQueries;
	readonly issueCommands: IssueCommands;
	readonly issueDialogs: IssueDialogs;
	readonly sprintDialogs: SprintDialogs;
	readonly menu: IssueMenu;
	readonly projects: ProjectCommands;
	readonly projectDialogs: ProjectDialogs;
	readonly issuePullAction: IssuePullAction;
	readonly navigator: IssueNavigator;
	readonly feed: ChangeFeed;
	readonly opener: BoardViewOpener;
}

interface SectionSpec {
	readonly id: string;
	readonly title: string;
	readonly sprint: Sprint | null;
	readonly issues: readonly Issue[];
	readonly action: { label: string; run: () => void; disabled?: string } | null;
}

const BACKLOG_SECTION_ID = '\u0000backlog';

/** Planning view: the active sprint, planned sprints and the backlog, with drag-and-drop ranking. */
export class BacklogView extends ItemView {
	private filter = '';
	private readonly collapsed = new Set<string>();
	private bodyEl: HTMLElement | null = null;
	private projectSwitcher: ProjectSwitcher | null = null;
	private refresh: () => void = () => undefined;
	private readonly actions: IssueItemActions;
	private readonly rows: IssueItemCache;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: BacklogViewDependencies,
	) {
		super(leaf);
		this.actions = issueItemActions(deps.navigator, deps.menu, deps.issueDialogs);
		this.rows = new IssueItemCache((parent, model) => renderIssueRow(parent, model, this.actions));
	}

	getViewType(): string {
		return BACKLOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Backlog';
	}

	getIcon(): string {
		return 'list-todo';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('obsidiboard-view', 'obsidiboard-backlog');
		this.renderToolbar(this.contentEl);
		const body = this.contentEl.createDiv({ cls: 'obsidiboard-backlog-body' });
		keepScroll(body, 'backlog-body');
		this.bodyEl = body;
		this.refresh = renderLive(this, this.contentEl, this.deps.feed, () => this.renderBody());
	}

	async onClose(): Promise<void> {
		this.rows.clear();
		this.contentEl.empty();
		this.bodyEl = null;
		this.projectSwitcher = null;
	}

	private renderToolbar(parent: HTMLElement): void {
		const toolbar = parent.createDiv({ cls: 'obsidiboard-toolbar' });
		toolbar.createEl('h2', { text: 'Backlog' });
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
		this.toolbarButton(toolbar, 'Create issue', 'plus', () => this.deps.issueDialogs.create(), true);
		this.toolbarButton(toolbar, 'Pull issues', 'download', () => this.deps.issuePullAction.run());
		this.toolbarButton(toolbar, 'Create sprint', 'calendar-plus', () => this.deps.sprintDialogs.create());
		this.toolbarButton(toolbar, 'Sprint board', 'kanban', () => runReporting(() => this.deps.opener.openSprintBoard()));
	}

	private toolbarButton(parent: HTMLElement, label: string, icon: string, onClick: () => void, primary = false): void {
		const button = parent.createEl('button', { cls: primary ? 'mod-cta' : '' });
		setIcon(button.createSpan({ cls: 'obsidiboard-button-icon' }), icon);
		button.createSpan({ text: label });
		button.addEventListener('click', onClick);
	}

	private renderBody(): void {
		const body = this.bodyEl;
		if (!body) return;
		this.projectSwitcher?.sync();
		const snapshot = this.deps.queries.snapshot();
		const toItem = itemModelFactory(snapshot);
		body.empty();
		this.sectionSpecs(snapshot).forEach((spec) => this.renderSection(body, spec, toItem));
		this.rows.keepOnly(new Set(snapshot.issues.map((issue) => issue.key)));
	}

	private sectionSpecs(snapshot: BoardSnapshot): SectionSpec[] {
		const model = snapshot.backlog();
		const activeName = model.activeSprint?.sprint.name ?? null;
		const sprintSpecs = [model.activeSprint, ...model.plannedSprints]
			.filter((section): section is SprintSection => section !== null)
			.map((section) => this.sprintSpec(section, activeName));
		const backlogSpec: SectionSpec = { id: BACKLOG_SECTION_ID, title: 'Backlog', sprint: null, issues: model.backlog, action: null };
		return [...sprintSpecs, backlogSpec];
	}

	private sprintSpec({ sprint, issues }: SprintSection, activeName: string | null): SectionSpec {
		const { sprintDialogs } = this.deps;
		const action =
			sprint.state === SprintState.Active
				? { label: 'Complete sprint', run: () => sprintDialogs.complete(sprint.name) }
				: {
						label: 'Start sprint',
						run: () => sprintDialogs.start(sprint.name),
						disabled: activeName ? `Complete ${activeName} first` : undefined,
					};
		return { id: sprint.name, title: sprint.name, sprint, issues, action };
	}

	private renderSection(parent: HTMLElement, spec: SectionSpec, toItem: (issue: Issue) => IssueItemModel): void {
		const isCollapsed = this.collapsed.has(spec.id);
		const section = parent.createDiv({ cls: 'obsidiboard-section' });
		section.toggleClass('is-active', spec.sprint?.state === SprintState.Active);
		this.renderSectionHeader(section, spec, isCollapsed);
		if (spec.sprint?.goal) section.createDiv({ cls: 'obsidiboard-goal', text: spec.sprint.goal });
		if (isCollapsed) return;
		const sprintName = spec.sprint?.name ?? null;
		const list = section.createDiv({ cls: 'obsidiboard-list' });
		makeIssueDropList(list, (key, beforeKey) =>
			runDrop(() => this.deps.issueCommands.move(key, sprintName, beforeKey), () => this.refresh()),
		);
		const visible = spec.issues.filter((issue) => matchesFilter(issue, this.filter));
		visible.forEach((issue) => this.rows.attach(list, toItem(issue)));
		if (visible.length === 0) {
			list.createDiv({ cls: 'obsidiboard-empty', text: sprintName ? 'Drag issues here to plan them into this sprint.' : 'The backlog is empty.' });
		}
		const add = section.createEl('button', { cls: 'obsidiboard-add-issue clickable-icon', text: 'Create issue' });
		add.addEventListener('click', () => this.deps.issueDialogs.create(sprintName));
	}

	private renderSectionHeader(section: HTMLElement, spec: SectionSpec, isCollapsed: boolean): void {
		const header = section.createDiv({ cls: 'obsidiboard-section-header' });
		const toggle = header.createEl('button', {
			cls: 'clickable-icon obsidiboard-collapse',
			attr: { 'aria-label': isCollapsed ? `Expand ${spec.title}` : `Collapse ${spec.title}`, 'aria-expanded': String(!isCollapsed) },
		});
		setIcon(toggle, isCollapsed ? 'chevron-right' : 'chevron-down');
		toggle.addEventListener('click', () => {
			if (isCollapsed) this.collapsed.delete(spec.id);
			else this.collapsed.add(spec.id);
			this.refresh();
		});
		header.createEl('h3', { text: spec.title });
		if (spec.sprint) header.createSpan({ cls: `obsidiboard-sprint-state is-${spec.sprint.state}`, text: SPRINT_STATE_LABEL[spec.sprint.state] });
		const dates = sprintDates(spec.sprint);
		if (dates) header.createSpan({ cls: 'obsidiboard-muted', text: dates });
		header.createSpan({ cls: 'obsidiboard-muted', text: `${spec.issues.length} issues · ${pointsLabel(totalPoints(spec.issues))}` });
		header.createSpan({ cls: 'obsidiboard-spacer' });
		if (spec.action) this.renderSectionAction(header, spec.action);
	}

	private renderSectionAction(header: HTMLElement, action: NonNullable<SectionSpec['action']>): void {
		const button = header.createEl('button', { text: action.label });
		if (action.disabled) {
			button.disabled = true;
			button.setAttribute('aria-label', action.disabled);
		}
		button.addEventListener('click', action.run);
	}
}

function sprintDates(sprint: Sprint | null): string | null {
	if (!sprint?.startDate || !sprint.endDate) return null;
	return `${sprint.startDate} → ${sprint.endDate}`;
}
