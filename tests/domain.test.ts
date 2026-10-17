import { describe, expect, it } from 'vitest';
import { buildBacklog, buildBoard } from '../src/domain/boardModels';
import { addDays, daysBetween, formatCalendarDate } from '../src/domain/calendarDate';
import { InvalidSprintNameError, InvalidStoryPointsError, InvalidWorkflowError } from '../src/domain/errors';
import { IssueLinkKind, parseStoryPoints } from '../src/domain/issue';
import { IssueGraph } from '../src/domain/issueGraph';
import { applyLinkDiff, diffLinks, linkChangesPerIssue } from '../src/domain/linkDiff';
import { isIssueKey, nextIssueNumber } from '../src/domain/issueKey';
import { planPlacement, rankBetween } from '../src/domain/ranking';
import { assertValidSprintName, SprintState } from '../src/domain/sprint';
import {
	EXTENDED_WORKFLOW,
	findWorkflowProblems,
	SIMPLE_WORKFLOW,
	StatusCategory,
	statusIdFromName,
	Workflow,
} from '../src/domain/workflow';
import { anIssue, aSprint } from './fakes';

describe('Workflow', () => {
	it('accepts both built-in presets', () => {
		expect(findWorkflowProblems(SIMPLE_WORKFLOW)).toEqual([]);
		expect(findWorkflowProblems(EXTENDED_WORKFLOW)).toEqual([]);
	});

	it('rejects empty, duplicate, malformed and done-less workflows', () => {
		expect(() => new Workflow([])).toThrow(InvalidWorkflowError);
		const problems = findWorkflowProblems([
			{ id: 'todo', name: 'To Do', category: StatusCategory.ToDo },
			{ id: 'todo', name: '', category: StatusCategory.InProgress },
			{ id: 'Bad Id', name: 'Bad', category: StatusCategory.ToDo },
		]);
		expect(problems).toHaveLength(4);
	});

	it('uses the first To Do status as the initial status', () => {
		const workflow = new Workflow([
			{ id: 'doing', name: 'Doing', category: StatusCategory.InProgress },
			{ id: 'later', name: 'Later', category: StatusCategory.ToDo },
			{ id: 'done', name: 'Done', category: StatusCategory.Done },
		]);
		expect(workflow.initialStatus.id).toBe('later');
	});

	it('resolves removed statuses to the initial status and judges completion by category', () => {
		const workflow = new Workflow(EXTENDED_WORKFLOW);
		expect(workflow.resolve('gone').id).toBe('todo');
		expect(workflow.isDone('done')).toBe(true);
		expect(workflow.isDone('in-review')).toBe(false);
	});

	it('derives status ids from names', () => {
		expect(statusIdFromName('  Plan Created! ')).toBe('plan-created');
	});
});

describe('ranking', () => {
	it('splits gaps and appends after the last item', () => {
		expect(rankBetween(null, null)).toBe(1000);
		expect(rankBetween(1000, 2000)).toBe(1500);
		expect(rankBetween(null, 1000)).toBe(0);
		expect(rankBetween(1000, null)).toBe(2000);
	});

	it('places an item before a target, ignoring its own current position', () => {
		const sequence = [anIssue('OB-1', { rank: 1000 }), anIssue('OB-2', { rank: 2000 }), anIssue('OB-3', { rank: 3000 })];
		expect(planPlacement(sequence, 'OB-3', 'OB-1')).toEqual([{ key: 'OB-3', rank: 0 }]);
		expect(planPlacement(sequence, 'OB-1', null)).toEqual([{ key: 'OB-1', rank: 4000 }]);
	});

	it('re-spaces the sequence when neighbours are too close', () => {
		const sequence = [anIssue('OB-1', { rank: 1 }), anIssue('OB-2', { rank: 1 + 1e-9 })];
		expect(planPlacement(sequence, 'OB-9', 'OB-2')).toEqual([
			{ key: 'OB-1', rank: 1000 },
			{ key: 'OB-9', rank: 2000 },
			{ key: 'OB-2', rank: 3000 },
		]);
	});
});

describe('issue keys', () => {
	it('finds the next number for the prefix only', () => {
		expect(nextIssueNumber(['OB-2', 'OB-10', 'XY-50'], 'OB')).toBe(11);
		expect(nextIssueNumber([], 'OB')).toBe(1);
	});

	it('recognises key-shaped note names', () => {
		expect(isIssueKey('OB-12')).toBe(true);
		expect(isIssueKey('README')).toBe(false);
	});
});

describe('calendar dates', () => {
	it('adds days across month ends in local time', () => {
		expect(addDays('2026-10-25', 14)).toBe('2026-11-08');
		expect(daysBetween('2026-10-16', '2026-10-29')).toBe(13);
		expect(formatCalendarDate(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('sprint names', () => {
	it('rejects names unusable as note names or wikilinks', () => {
		expect(() => assertValidSprintName('Sprint 1')).not.toThrow();
		for (const bad of ['', ' padded ', 'a/b', 'x[y]', 'q#1']) {
			expect(() => assertValidSprintName(bad)).toThrow(InvalidSprintNameError);
		}
	});
});

describe('IssueGraph', () => {
	const issues = [
		anIssue('OB-1', { links: { ...anIssue('x').links, [IssueLinkKind.Blocks]: ['OB-2'] } }),
		anIssue('OB-2', { parent: 'OB-3' }),
		anIssue('OB-3', { status: 'done' }),
		anIssue('OB-4', { links: { ...anIssue('x').links, [IssueLinkKind.BlockedBy]: ['OB-3', 'OB-404'] } }),
	];
	const graph = new IssueGraph(issues);
	const isDone = (status: string) => status === 'done';

	it('resolves links written on only one side in both directions', () => {
		expect(graph.linksOf('OB-2')[IssueLinkKind.BlockedBy]).toEqual(['OB-1']);
		expect(graph.linksOf('OB-3')[IssueLinkKind.Blocks]).toEqual(['OB-4']);
	});

	it('ignores links to issues that do not exist', () => {
		expect(graph.linksOf('OB-4')[IssueLinkKind.BlockedBy]).toEqual(['OB-3']);
	});

	it('reports only unfinished blockers as open', () => {
		expect(graph.openBlockersOf('OB-2', isDone)).toEqual(['OB-1']);
		expect(graph.openBlockersOf('OB-4', isDone)).toEqual([]);
	});

	it('derives children and detects ancestry', () => {
		expect(graph.childrenOf('OB-3')).toEqual(['OB-2']);
		expect(graph.isSelfOrAncestor('OB-3', 'OB-2')).toBe(true);
		expect(graph.isSelfOrAncestor('OB-2', 'OB-3')).toBe(false);
	});
});

describe('board models', () => {
	const workflow = new Workflow(EXTENDED_WORKFLOW);
	const sprints = [
		aSprint('Sprint 1', { state: SprintState.Closed, sequence: 1 }),
		aSprint('Sprint 2', { state: SprintState.Active, sequence: 2 }),
		aSprint('Sprint 4', { sequence: 4 }),
		aSprint('Sprint 3', { sequence: 3 }),
	];
	const issues = [
		anIssue('OB-1', { sprint: 'Sprint 1', status: 'done' }),
		anIssue('OB-2', { sprint: 'Sprint 1', status: 'in-progress', rank: 2 }),
		anIssue('OB-3', { sprint: 'Sprint 2', status: 'blocked' }),
		anIssue('OB-4', { sprint: 'Sprint 2', status: 'retired-status' }),
		anIssue('OB-5', { sprint: 'Missing sprint', rank: 1 }),
		anIssue('OB-6', { sprint: 'Sprint 3' }),
	];

	it('groups the backlog by active sprint, planned sprints in order, then backlog', () => {
		const backlog = buildBacklog(issues, sprints, workflow);
		expect(backlog.activeSprint?.issues.map((i) => i.key)).toEqual(['OB-3', 'OB-4']);
		expect(backlog.plannedSprints.map((s) => s.sprint.name)).toEqual(['Sprint 3', 'Sprint 4']);
		expect(backlog.backlog.map((i) => i.key)).toEqual(['OB-5', 'OB-2']);
	});

	it('builds one column per configured status, placing unknown statuses in the first', () => {
		const board = buildBoard(issues, sprints, workflow);
		expect(board?.columns.map((c) => c.status.id)).toEqual(EXTENDED_WORKFLOW.map((s) => s.id));
		expect(board?.columns[0]?.issues.map((i) => i.key)).toEqual(['OB-4']);
		expect(board?.columns[1]?.issues.map((i) => i.key)).toEqual(['OB-3']);
	});
});

describe('story points', () => {
	it('parses blank as unestimated and rejects negatives and text', () => {
		expect(parseStoryPoints(' ')).toBeNull();
		expect(parseStoryPoints('2.5')).toBe(2.5);
		expect(() => parseStoryPoints('-1')).toThrow(InvalidStoryPointsError);
		expect(() => parseStoryPoints('lots')).toThrow(InvalidStoryPointsError);
	});
});

describe('diffLinks', () => {
	it('reports links added to and removed from the desired set', () => {
		const empty = anIssue('x').links;
		const before = { ...empty, [IssueLinkKind.Blocks]: ['OB-2', 'OB-3'], [IssueLinkKind.RelatesTo]: ['OB-9'] };
		const after = { ...empty, [IssueLinkKind.Blocks]: ['OB-3', 'OB-4'], [IssueLinkKind.RelatesTo]: ['OB-9'] };
		expect(diffLinks(before, after)).toEqual({
			added: [{ kind: IssueLinkKind.Blocks, target: 'OB-4' }],
			removed: [{ kind: IssueLinkKind.Blocks, target: 'OB-2' }],
		});
		expect(diffLinks(before, before)).toEqual({ added: [], removed: [] });
	});
});

describe('linkChangesPerIssue and applyLinkDiff', () => {
	const diff = {
		added: [
			{ kind: IssueLinkKind.Blocks, target: 'OB-2' },
			{ kind: IssueLinkKind.RelatesTo, target: 'OB-2' },
		],
		removed: [{ kind: IssueLinkKind.Duplicates, target: 'OB-3' }],
	};

	it('groups every side of every link under the note that must record it', () => {
		const perIssue = linkChangesPerIssue('OB-1', diff);
		expect(perIssue.get('OB-1')).toEqual(diff);
		expect(perIssue.get('OB-2')).toEqual({
			added: [
				{ kind: IssueLinkKind.BlockedBy, target: 'OB-1' },
				{ kind: IssueLinkKind.RelatesTo, target: 'OB-1' },
			],
			removed: [],
		});
		expect(perIssue.get('OB-3')).toEqual({ added: [], removed: [{ kind: IssueLinkKind.DuplicatedBy, target: 'OB-1' }] });
	});

	it('applies removals then additions without duplicating or touching other links', () => {
		const links = { ...anIssue('x').links, [IssueLinkKind.Blocks]: ['OB-2', 'OB-5'], [IssueLinkKind.Duplicates]: ['OB-3'] };
		const result = applyLinkDiff(links, diff);
		expect(result[IssueLinkKind.Blocks]).toEqual(['OB-2', 'OB-5']);
		expect(result[IssueLinkKind.RelatesTo]).toEqual(['OB-2']);
		expect(result[IssueLinkKind.Duplicates]).toEqual([]);
		expect(links[IssueLinkKind.Duplicates]).toEqual(['OB-3']);
	});
});
