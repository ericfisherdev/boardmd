import { beforeEach, describe, expect, it } from 'vitest';
import { IssueCommands } from '../src/application/IssueCommands';
import { IssueEditCommands } from '../src/application/IssueEditCommands';
import { IssueLinkCommands } from '../src/application/IssueLinkCommands';
import { SprintCommands } from '../src/application/SprintCommands';
import { WorkflowCommands } from '../src/application/WorkflowCommands';
import {
	DuplicateSprintNameError,
	InvalidIssueSummaryError,
	InvalidSprintDateError,
	InvalidSprintScheduleError,
	InvalidWorkflowError,
	IssueNotFoundError,
	IssueNotInActiveSprintError,
	ParentCycleError,
	SelfLinkError,
	SprintAlreadyActiveError,
	SprintClosedError,
	SprintNotActiveError,
	SprintNotFutureError,
	UnknownStatusError,
} from '../src/domain/errors';
import { IssueLinkKind, IssuePriority, IssueType } from '../src/domain/issue';
import { IssueGraph } from '../src/domain/issueGraph';
import { SprintState } from '../src/domain/sprint';
import { EXTENDED_WORKFLOW, SIMPLE_WORKFLOW, StatusDefinition, Workflow } from '../src/domain/workflow';
import { anIssue, aSprint, config, FixedClock, InMemoryIssueRepository, InMemorySprintRepository, LaggingIssueRepository } from './fakes';

const TODAY = '2026-10-16';
const draft = {
	summary: '  Build the backlog  ',
	type: IssueType.Story,
	priority: IssuePriority.High,
	points: 3,
	assignee: null,
	sprint: null,
	parent: null,
	description: 'Details',
};

describe('IssueCommands', () => {
	let issues: InMemoryIssueRepository;
	let sprints: InMemorySprintRepository;
	let commands: IssueCommands;

	beforeEach(() => {
		issues = new InMemoryIssueRepository([
			anIssue('OB-1', { rank: 1000 }),
			anIssue('OB-2', { rank: 2000 }),
			anIssue('OB-3', { sprint: 'Sprint 1', rank: 500 }),
			anIssue('OB-4', { sprint: 'Sprint 1', rank: 600, status: 'in-progress' }),
		]);
		sprints = new InMemorySprintRepository([
			aSprint('Sprint 1', { state: SprintState.Active }),
			aSprint('Sprint 0', { state: SprintState.Closed }),
		]);
		commands = new IssueCommands(issues, sprints, config(EXTENDED_WORKFLOW), new FixedClock(TODAY));
	});

	it('creates issues with the next key, initial status, trimmed summary and a rank after the backlog', async () => {
		const issue = await commands.create(draft);
		expect(issue).toMatchObject({ key: 'OB-5', summary: 'Build the backlog', status: 'todo', rank: 3000, created: TODAY });
		expect(issues.descriptions.get('OB-5')).toBe('Details');
	});

	it('skips keys whose notes exist but are not indexed yet', async () => {
		const exists = issues.exists.bind(issues);
		issues.exists = (key) => key === 'OB-5' || exists(key);
		expect((await commands.create(draft)).key).toBe('OB-6');
	});

	it('rejects blank summaries and closed sprints', async () => {
		await expect(commands.create({ ...draft, summary: ' ' })).rejects.toThrow(InvalidIssueSummaryError);
		await expect(commands.create({ ...draft, sprint: 'Sprint 0' })).rejects.toThrow(SprintClosedError);
	});

	it('stamps and clears the resolved date as issues enter and leave done', async () => {
		await commands.transition('OB-1', 'done');
		expect(issues.get('OB-1').resolved).toBe(TODAY);
		await commands.transition('OB-1', 'in-review');
		expect(issues.get('OB-1')).toMatchObject({ status: 'in-review', resolved: null });
		await expect(commands.transition('OB-1', 'nope')).rejects.toThrow(UnknownStatusError);
	});

	it('moves an issue into a sprint before another issue', async () => {
		await commands.move('OB-2', 'Sprint 1', 'OB-3');
		expect(issues.get('OB-2')).toMatchObject({ sprint: 'Sprint 1', rank: -500 });
	});

	it('moves an issue back to the backlog', async () => {
		await commands.move('OB-3', null, 'OB-2');
		expect(issues.get('OB-3')).toMatchObject({ sprint: null, rank: 1500 });
	});

	it('places an issue in a board column and rejects issues outside the active sprint', async () => {
		await commands.placeOnBoard('OB-3', 'in-progress', 'OB-4');
		expect(issues.get('OB-3')).toMatchObject({ status: 'in-progress', rank: -400 });
		await expect(commands.placeOnBoard('OB-1', 'done', null)).rejects.toThrow(IssueNotInActiveSprintError);
	});
});

describe('SprintCommands', () => {
	let issues: InMemoryIssueRepository;
	let sprints: InMemorySprintRepository;
	let commands: SprintCommands;

	beforeEach(() => {
		issues = new InMemoryIssueRepository([
			anIssue('OB-1', { sprint: 'Sprint 1', points: 3, status: 'done', rank: 1 }),
			anIssue('OB-2', { sprint: 'Sprint 1', points: 5, status: 'in-progress', rank: 2 }),
			anIssue('OB-3', { sprint: 'Sprint 1', points: 2, rank: 3 }),
			anIssue('OB-4', { sprint: 'Sprint 2', rank: 1000 }),
		]);
		sprints = new InMemorySprintRepository([aSprint('Sprint 1', { sequence: 1 }), aSprint('Sprint 2', { sequence: 2 })]);
		commands = new SprintCommands(sprints, issues, config(), new FixedClock(TODAY));
	});

	it('suggests the next free name and a schedule of the configured length', () => {
		expect(commands.suggestName()).toBe('Sprint 3');
		expect(commands.suggestPlan('Sprint 1')).toEqual({ startDate: TODAY, endDate: '2026-10-29', goal: '' });
	});

	it('creates future sprints with increasing sequence and unique names', async () => {
		expect(await commands.create('Sprint 3')).toMatchObject({ state: SprintState.Future, sequence: 3 });
		await expect(commands.create('Sprint 3')).rejects.toThrow(DuplicateSprintNameError);
	});

	it('starts a sprint, recording its commitment, and allows only one active sprint', async () => {
		await commands.start('Sprint 1', { startDate: TODAY, endDate: '2026-10-29', goal: ' Ship ' });
		expect(sprints.get('Sprint 1')).toMatchObject({ state: SprintState.Active, goal: 'Ship', committedPoints: 10 });
		await expect(commands.start('Sprint 2', commands.suggestPlan('Sprint 2'))).rejects.toThrow(SprintAlreadyActiveError);
		await expect(commands.start('Sprint 1', commands.suggestPlan('Sprint 1'))).rejects.toThrow(SprintNotFutureError);
	});

	it('rejects schedules that end before they start', async () => {
		await expect(commands.start('Sprint 1', { startDate: TODAY, endDate: '2026-10-01', goal: '' })).rejects.toThrow(
			InvalidSprintScheduleError,
		);
	});

	it('rejects a missing start or end date instead of storing an empty one', async () => {
		await expect(commands.start('Sprint 1', { startDate: '', endDate: '2026-10-30', goal: '' })).rejects.toThrow(InvalidSprintDateError);
		await expect(commands.start('Sprint 1', { startDate: TODAY, endDate: '', goal: '' })).rejects.toThrow(InvalidSprintDateError);
		expect(sprints.get('Sprint 1').state).toBe(SprintState.Future);
	});

	it('completes a sprint: records the outcome and carries unfinished issues after the destination', async () => {
		await commands.start('Sprint 1', commands.suggestPlan('Sprint 1'));
		await commands.complete('Sprint 1', 'Sprint 2');
		expect(sprints.get('Sprint 1')).toMatchObject({
			state: SprintState.Closed,
			outcome: { completedIssues: ['OB-1'], carriedOverIssues: ['OB-2', 'OB-3'], completedPoints: 3 },
		});
		expect(issues.get('OB-1').sprint).toBe('Sprint 1');
		expect(issues.get('OB-2')).toMatchObject({ sprint: 'Sprint 2', rank: 2000 });
		expect(issues.get('OB-3')).toMatchObject({ sprint: 'Sprint 2', rank: 3000 });
	});

	it('only completes the active sprint, into a future sprint or the backlog', async () => {
		await expect(commands.complete('Sprint 1', null)).rejects.toThrow(SprintNotActiveError);
		await commands.start('Sprint 1', commands.suggestPlan('Sprint 1'));
		await expect(commands.complete('Sprint 1', 'Sprint 1')).rejects.toThrow(SprintNotFutureError);
		await commands.complete('Sprint 1', null);
		expect(issues.get('OB-2').sprint).toBeNull();
	});
});

describe('IssueLinkCommands', () => {
	let issues: InMemoryIssueRepository;
	let commands: IssueLinkCommands;

	beforeEach(() => {
		issues = new InMemoryIssueRepository([anIssue('OB-1'), anIssue('OB-2'), anIssue('OB-3', { parent: 'OB-2' })]);
		commands = new IssueLinkCommands(issues);
	});

	it('writes both directions of a link, once', async () => {
		await commands.link('OB-1', IssueLinkKind.Blocks, 'OB-2');
		await commands.link('OB-1', IssueLinkKind.Blocks, 'OB-2');
		expect(issues.get('OB-1').links[IssueLinkKind.Blocks]).toEqual(['OB-2']);
		expect(issues.get('OB-2').links[IssueLinkKind.BlockedBy]).toEqual(['OB-1']);
	});

	it('removes both directions of a link', async () => {
		await commands.link('OB-1', IssueLinkKind.Duplicates, 'OB-2');
		await commands.unlink('OB-2', IssueLinkKind.DuplicatedBy, 'OB-1');
		expect(issues.get('OB-1').links[IssueLinkKind.Duplicates]).toEqual([]);
		expect(issues.get('OB-2').links[IssueLinkKind.DuplicatedBy]).toEqual([]);
	});

	it('rejects self links and parent cycles', async () => {
		await expect(commands.link('OB-1', IssueLinkKind.RelatesTo, 'OB-1')).rejects.toThrow(SelfLinkError);
		await expect(commands.setParent('OB-2', 'OB-3')).rejects.toThrow(ParentCycleError);
		await commands.setParent('OB-2', 'OB-1');
		expect(issues.get('OB-2').parent).toBe('OB-1');
	});
});

describe('WorkflowCommands', () => {
	class StubWorkflowStore {
		workflow = new Workflow(EXTENDED_WORKFLOW);
		async saveStatuses(statuses: readonly StatusDefinition[]): Promise<void> {
			this.workflow = new Workflow(statuses);
		}
	}

	it('moves issues from removed statuses to the same category and applies renames', async () => {
		const issues = new InMemoryIssueRepository([
			anIssue('OB-1', { status: 'in-review' }),
			anIssue('OB-2', { status: 'blocked' }),
			anIssue('OB-3', { status: 'done' }),
			anIssue('OB-4', { status: 'plan-created' }),
		]);
		const store = new StubWorkflowStore();
		const commands = new WorkflowCommands(store, issues);
		const next = SIMPLE_WORKFLOW.map((s) => (s.id === 'done' ? { ...s, id: 'shipped' } : s));
		const moved = await commands.replace(next, new Map([['done', 'shipped']]));
		expect(moved).toBe(4);
		expect(['OB-1', 'OB-2', 'OB-3', 'OB-4'].map((key) => issues.get(key).status)).toEqual(['in-progress', 'todo', 'shipped', 'todo']);
		expect(store.workflow.statuses.map((s) => s.id)).toEqual(['todo', 'in-progress', 'shipped']);
	});

	it('changes nothing when the new workflow is invalid', async () => {
		const issues = new InMemoryIssueRepository([anIssue('OB-1', { status: 'in-review' })]);
		const store = new StubWorkflowStore();
		await expect(new WorkflowCommands(store, issues).replace([])).rejects.toThrow(InvalidWorkflowError);
		expect(issues.get('OB-1').status).toBe('in-review');
		expect(store.workflow.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
	});
});

describe('IssueEditCommands', () => {
	let issues: InMemoryIssueRepository;
	let commands: IssueEditCommands;
	const unchanged = (key: string) => {
		const issue = issues.get(key);
		return {
			details: { summary: issue.summary, type: issue.type, priority: issue.priority, points: issue.points, assignee: issue.assignee },
			status: issue.status,
			parent: issue.parent,
			links: new IssueGraph(issues.findAll()).linksOf(key),
		};
	};

	beforeEach(() => {
		issues = new InMemoryIssueRepository([
			anIssue('OB-1', { type: IssueType.Epic }),
			anIssue('OB-2', { links: { ...anIssue('x').links, [IssueLinkKind.Blocks]: ['OB-3'] } }),
			anIssue('OB-3', { links: { ...anIssue('x').links, [IssueLinkKind.BlockedBy]: ['OB-2'] }, parent: 'OB-1' }),
			anIssue('OB-4'),
		]);
		const issueCommands = new IssueCommands(issues, new InMemorySprintRepository(), config(EXTENDED_WORKFLOW), new FixedClock(TODAY));
		commands = new IssueEditCommands(issues, issueCommands, new IssueLinkCommands(issues));
	});

	it('writes status, parent and both sides of added and removed links', async () => {
		const edit = unchanged('OB-2');
		await commands.apply('OB-2', {
			...edit,
			details: { ...edit.details, summary: 'Renamed' },
			status: 'done',
			parent: 'OB-1',
			links: { ...edit.links, [IssueLinkKind.Blocks]: ['OB-4'], [IssueLinkKind.RelatesTo]: ['OB-3'] },
		});
		expect(issues.get('OB-2')).toMatchObject({ summary: 'Renamed', status: 'done', resolved: TODAY, parent: 'OB-1' });
		expect(issues.get('OB-3').links[IssueLinkKind.BlockedBy]).toEqual([]);
		expect(issues.get('OB-4').links[IssueLinkKind.BlockedBy]).toEqual(['OB-2']);
		expect(issues.get('OB-3').links[IssueLinkKind.RelatesTo]).toEqual(['OB-2']);
	});

	it('shows links written on only one note and removes them from both', async () => {
		const edit = unchanged('OB-3');
		expect(edit.links[IssueLinkKind.BlockedBy]).toEqual(['OB-2']);
		await commands.apply('OB-3', { ...edit, links: { ...edit.links, [IssueLinkKind.BlockedBy]: [] } });
		expect(issues.get('OB-2').links[IssueLinkKind.Blocks]).toEqual([]);
	});

	it('changes nothing it was not asked to change', async () => {
		const before = issues.findAll();
		await commands.apply('OB-2', unchanged('OB-2'));
		expect(issues.findAll()).toEqual(before);
	});

	it('rejects parent cycles, unknown statuses and blank summaries', async () => {
		const edit = unchanged('OB-1');
		await expect(commands.apply('OB-1', { ...edit, parent: 'OB-3' })).rejects.toThrow(ParentCycleError);
		await expect(commands.apply('OB-1', { ...edit, status: 'nope' })).rejects.toThrow(UnknownStatusError);
		await expect(commands.apply('OB-1', { ...edit, details: { ...edit.details, summary: ' ' } })).rejects.toThrow(InvalidIssueSummaryError);
	});
});

describe('IssueEditCommands while the metadata cache lags behind writes', () => {
	let issues: LaggingIssueRepository;
	let commands: IssueEditCommands;
	const withLinks = (links: Partial<Record<IssueLinkKind, string[]>>) => ({ ...anIssue('x').links, ...links });
	const unchanged = (key: string) => {
		const issue = issues.get(key);
		return {
			details: { summary: issue.summary, type: issue.type, priority: issue.priority, points: issue.points, assignee: issue.assignee },
			status: issue.status,
			parent: issue.parent,
			links: new IssueGraph(issues.findAll()).linksOf(key),
		};
	};

	beforeEach(() => {
		issues = new LaggingIssueRepository([
			anIssue('OB-1', { links: withLinks({ [IssueLinkKind.Blocks]: ['OB-2'] }) }),
			anIssue('OB-2', { links: withLinks({ [IssueLinkKind.BlockedBy]: ['OB-1'] }) }),
			anIssue('OB-3'),
		]);
		const issueCommands = new IssueCommands(issues, new InMemorySprintRepository(), config(), new FixedClock(TODAY));
		commands = new IssueEditCommands(issues, issueCommands, new IssueLinkCommands(issues));
	});

	it('keeps a removal and an addition made in the same save', async () => {
		const edit = unchanged('OB-1');
		await commands.apply('OB-1', { ...edit, links: { ...edit.links, [IssueLinkKind.Blocks]: ['OB-3'] } });
		expect(issues.get('OB-1').links[IssueLinkKind.Blocks]).toEqual(['OB-3']);
		expect(issues.get('OB-2').links[IssueLinkKind.BlockedBy]).toEqual([]);
		expect(issues.get('OB-3').links[IssueLinkKind.BlockedBy]).toEqual(['OB-1']);
	});

	it('keeps two different link kinds added to the same issue in the same save', async () => {
		const edit = unchanged('OB-1');
		const links = { ...edit.links, [IssueLinkKind.Blocks]: ['OB-2', 'OB-3'], [IssueLinkKind.RelatesTo]: ['OB-3'] };
		await commands.apply('OB-1', { ...edit, links });
		expect(issues.get('OB-1').links).toMatchObject({ [IssueLinkKind.Blocks]: ['OB-2', 'OB-3'], [IssueLinkKind.RelatesTo]: ['OB-3'] });
		expect(issues.get('OB-3').links).toMatchObject({ [IssueLinkKind.BlockedBy]: ['OB-1'], [IssueLinkKind.RelatesTo]: ['OB-1'] });
	});

	it('writes each affected note once, and only the field groups that changed', async () => {
		const edit = unchanged('OB-1');
		await commands.apply('OB-1', { ...edit, links: { ...edit.links, [IssueLinkKind.Blocks]: ['OB-3'] } });
		expect([...issues.writes].sort()).toEqual(['OB-1', 'OB-2', 'OB-3']);
	});

	it('saves details and a status change in a single write, and nothing when nothing changed', async () => {
		const edit = unchanged('OB-3');
		await commands.apply('OB-3', edit);
		expect(issues.writes).toEqual([]);
		await commands.apply('OB-3', { ...edit, details: { ...edit.details, summary: 'Renamed' }, status: 'done' });
		expect(issues.writes).toEqual(['OB-3']);
		expect(issues.get('OB-3')).toMatchObject({ summary: 'Renamed', status: 'done', resolved: TODAY });
	});

	it('does not rewrite details when only a link changed', async () => {
		const edit = unchanged('OB-3');
		await commands.apply('OB-3', { ...edit, links: { ...edit.links, [IssueLinkKind.RelatesTo]: ['OB-2'] } });
		expect(issues.writes).toEqual(['OB-3', 'OB-2']);
	});
});

describe('IssueCommands parent on create', () => {
	it('stores the parent and rejects one that does not exist', async () => {
		const issues = new InMemoryIssueRepository([anIssue('OB-1', { type: IssueType.Epic })]);
		const commands = new IssueCommands(issues, new InMemorySprintRepository(), config(), new FixedClock(TODAY));
		expect((await commands.create({ ...draft, parent: 'OB-1' })).parent).toBe('OB-1');
		await expect(commands.create({ ...draft, parent: 'OB-99' })).rejects.toThrow(IssueNotFoundError);
	});
});
