import { App, Notice } from 'obsidian';
import { BoardQueries } from '../application/BoardQueries';
import { IssueCommands, IssueDetails } from '../application/IssueCommands';
import { IssueEditCommands } from '../application/IssueEditCommands';
import { IssueLinkCommands } from '../application/IssueLinkCommands';
import { WriteSettlement } from '../application/ports';
import { IssueNotFoundError } from '../domain/errors';
import { emptyIssueLinks, Issue, ISSUE_LINK_KINDS, IssueLinkKind, IssuePriority, IssueType } from '../domain/issue';
import { SprintState } from '../domain/sprint';
import { LINK_KIND_LABEL } from './labels';
import { Choice, ChoiceModal } from './modals/ChoiceModal';
import { IssueFormMode, IssueFormModal, IssueFormValues } from './modals/IssueFormModal';
import { reportError, runReporting } from './reportError';

interface LinkChoice {
	readonly kind: IssueLinkKind;
	readonly target: string;
}

/** Opens the forms and pickers that change a single issue. */
export class IssueDialogs {
	constructor(
		private readonly app: App,
		private readonly queries: BoardQueries,
		private readonly issueCommands: IssueCommands,
		private readonly linkCommands: IssueLinkCommands,
		private readonly editCommands: IssueEditCommands,
		private readonly settlement: WriteSettlement,
	) {}

	create(sprint: string | null = null): void {
		new IssueFormModal(this.app, {
			...this.formContext(null),
			mode: IssueFormMode.Create,
			title: 'Create issue',
			submitLabel: 'Create',
			initial: {
				summary: '',
				type: IssueType.Story,
				priority: IssuePriority.Medium,
				points: null,
				assignee: null,
				status: this.queries.workflow.initialStatus.id,
				sprint,
				parent: null,
				links: emptyIssueLinks(),
				description: '',
			},
			onSubmit: async (values) => {
				const issue = await this.issueCommands.create(values);
				new Notice(`Created ${issue.key}: ${issue.summary}`);
			},
		}).open();
	}

	/** Edit form for an existing issue: details, status, parent and links. */
	editDetails(key: string): void {
		const issue = this.issueOrReport(key);
		if (!issue) return;
		new IssueFormModal(this.app, {
			...this.formContext(key),
			mode: IssueFormMode.Edit,
			title: `Edit ${key}`,
			submitLabel: 'Done',
			initial: {
				summary: issue.summary,
				type: issue.type,
				priority: issue.priority,
				points: issue.points,
				assignee: issue.assignee,
				status: this.queries.workflow.resolve(issue.status).id,
				sprint: issue.sprint,
				parent: issue.parent,
				links: this.queries.graph().linksOf(key),
				description: '',
			},
			settled: () => this.settlement.whenSettled(),
			onSubmit: (values) =>
				this.editCommands.apply(key, {
					details: pickDetails(values),
					status: values.status,
					parent: values.parent,
					links: values.links,
				}),
		}).open();
	}

	/** Choices shared by both modes; `excludeKey` keeps an issue from being offered as its own relation. */
	private formContext(excludeKey: string | null) {
		return {
			statusChoices: this.queries.workflow.statuses.map((status) => ({ label: status.name, value: status.id })),
			sprintChoices: this.planningChoices(),
			issueOptions: this.queries
				.allIssues()
				.filter((issue) => issue.key !== excludeKey)
				.map(({ key, summary, type }) => ({ key, summary, type })),
		};
	}

	changeStatus(key: string): void {
		const choices = this.queries.workflow.statuses.map((status) => ({ label: status.name, value: status.id }));
		this.choose(`New status for ${key}`, choices, (statusId) => this.issueCommands.transition(key, statusId));
	}

	move(key: string): void {
		this.choose(`Move ${key} to…`, this.planningChoices(), (sprint) => this.issueCommands.move(key, sprint, null));
	}

	addLink(key: string): void {
		const kinds = ISSUE_LINK_KINDS.map((kind) => ({ label: `${key} ${LINK_KIND_LABEL[kind]}…`, value: kind }));
		this.choose('Link type', kinds, async (kind) => {
			this.choose(`${key} ${LINK_KIND_LABEL[kind]}…`, this.otherIssueChoices(key), (target) =>
				this.linkCommands.link(key, kind, target),
			);
		});
	}

	removeLink(key: string): void {
		const links = this.queries.graph().linksOf(key);
		const choices: Choice<LinkChoice>[] = ISSUE_LINK_KINDS.flatMap((kind) =>
			links[kind].map((target) => ({ label: `${LINK_KIND_LABEL[kind]} ${this.describe(target)}`, value: { kind, target } })),
		);
		this.choose(`Remove a link from ${key}`, choices, ({ kind, target }) => this.linkCommands.unlink(key, kind, target));
	}

	setParent(key: string): void {
		const choices: Choice<string | null>[] = [{ label: 'No parent', value: null }, ...this.otherIssueChoices(key, IssueType.Epic)];
		this.choose(`Parent of ${key}`, choices, (parent) => this.linkCommands.setParent(key, parent));
	}

	private choose<T>(placeholder: string, choices: readonly Choice<T>[], onChoose: (value: T) => Promise<void>): void {
		new ChoiceModal(this.app, placeholder, choices, (value) => runReporting(() => onChoose(value))).open();
	}

	/** Backlog plus open sprints, active first. */
	private planningChoices(): Choice<string | null>[] {
		const sprints = this.queries.openSprints().map((sprint) => ({
			label: sprint.state === SprintState.Active ? `${sprint.name} (active)` : sprint.name,
			value: sprint.name,
		}));
		return [{ label: 'Backlog', value: null }, ...sprints];
	}

	/** Every other issue, with issues of `preferredType` listed first. */
	private otherIssueChoices(key: string, preferredType?: IssueType): Choice<string>[] {
		const others = this.queries.allIssues().filter((issue) => issue.key !== key);
		const preferred = (issue: Issue) => (issue.type === preferredType ? 0 : 1);
		return others
			.sort((a, b) => preferred(a) - preferred(b) || a.key.localeCompare(b.key, undefined, { numeric: true }))
			.map((issue) => ({ label: this.describe(issue.key), value: issue.key }));
	}

	private describe(key: string): string {
		const issue = this.queries.issue(key);
		return issue ? `${key} ${issue.summary}` : key;
	}

	private issueOrReport(key: string): Issue | null {
		const issue = this.queries.issue(key);
		if (!issue) reportError(new IssueNotFoundError(key));
		return issue;
	}
}

function pickDetails({ summary, type, priority, points, assignee }: IssueFormValues): IssueDetails {
	return { summary, type, priority, points, assignee };
}
