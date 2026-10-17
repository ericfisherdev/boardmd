import { describe, expect, it } from 'vitest';
import { IssueLinkKind, IssuePriority, IssueType } from '../src/domain/issue';
import { SprintState } from '../src/domain/sprint';
import { EXTENDED_WORKFLOW, StatusCategory, Workflow } from '../src/domain/workflow';
import { buildAgentIndex } from '../src/infrastructure/agent/agentIndex';
import { renderAgentGuide } from '../src/infrastructure/agent/agentGuide';
import { locationsFor } from '../src/infrastructure/boardLocations';
import { issueFrontmatter, readIssue, writeIssueChanges } from '../src/infrastructure/frontmatter/issueFrontmatter';
import { readSprint, sprintFrontmatter } from '../src/infrastructure/frontmatter/sprintFrontmatter';
import { readNoteReference, readNoteReferences } from '../src/infrastructure/frontmatter/values';
import { sanitizeSettings } from '../src/settings/settings';
import { anIssue, aSprint } from './fakes';

describe('note references', () => {
	it('accepts wikilinks with paths, aliases and headings, or plain names', () => {
		expect(readNoteReference('[[Sprint 3]]')).toBe('Sprint 3');
		expect(readNoteReference('[[Board/sprints/Sprint 3|S3]]')).toBe('Sprint 3');
		expect(readNoteReference('[[OB-2#Notes]]')).toBe('OB-2');
		expect(readNoteReference('Sprint 3')).toBe('Sprint 3');
		expect(readNoteReference('  ')).toBeNull();
		expect(readNoteReferences(['[[OB-1]]', 'OB-1', 7, '[[OB-2]]'])).toEqual(['OB-1', 'OB-2']);
		expect(readNoteReferences('[[OB-1]]')).toEqual(['OB-1']);
	});
});

describe('issue frontmatter', () => {
	const issue = anIssue('OB-7', {
		type: IssueType.Bug,
		priority: IssuePriority.Highest,
		points: 5,
		sprint: 'Sprint 3',
		parent: 'OB-1',
		links: { ...anIssue('x').links, [IssueLinkKind.BlockedBy]: ['OB-2', 'OB-3'] },
	});

	it('round-trips an issue through flat, wikilinked frontmatter', () => {
		const frontmatter = issueFrontmatter(issue);
		expect(frontmatter).toMatchObject({ sprint: '[[Sprint 3]]', parent: '[[OB-1]]', blocked_by: ['[[OB-2]]', '[[OB-3]]'] });
		expect(frontmatter).not.toHaveProperty('blocks');
		expect(frontmatter).not.toHaveProperty('assignee');
		expect(readIssue('OB-7', frontmatter, 'todo')).toEqual(issue);
	});

	it('removes cleared fields and leaves unrelated fields alone', () => {
		const frontmatter: Record<string, unknown> = { ...issueFrontmatter(issue), tags: ['work'] };
		writeIssueChanges(frontmatter, { sprint: null, points: null, links: anIssue('x').links });
		expect(frontmatter).not.toHaveProperty('sprint');
		expect(frontmatter).not.toHaveProperty('points');
		expect(frontmatter).not.toHaveProperty('blocked_by');
		expect(frontmatter.tags).toEqual(['work']);
	});

	it('falls back to defaults for hand-written or missing values', () => {
		const read = readIssue('OB-9', { type: 'feature', priority: 3, points: '8', created: new Date(2026, 9, 2) }, 'todo');
		expect(read).toMatchObject({ summary: 'OB-9', type: IssueType.Task, priority: IssuePriority.Medium, points: 8, status: 'todo', created: '2026-10-02' });
	});
});

describe('sprint frontmatter', () => {
	it('round-trips a completed sprint', () => {
		const sprint = aSprint('Sprint 2', {
			state: SprintState.Closed,
			startDate: '2026-10-01',
			endDate: '2026-10-14',
			goal: 'Ship',
			committedPoints: 13,
			outcome: { completedIssues: ['OB-1'], carriedOverIssues: [], completedPoints: 0 },
		});
		const frontmatter = sprintFrontmatter(sprint);
		expect(frontmatter).toMatchObject({ completed_issues: ['[[OB-1]]'], completed_points: 0, start_date: '2026-10-01' });
		expect(readSprint('Sprint 2', frontmatter)).toEqual(sprint);
	});
});

describe('agent files', () => {
	const locations = locationsFor('Projects', 'Board');
	const workflow = new Workflow(EXTENDED_WORKFLOW);
	const issues = [
		anIssue('OB-10', { sprint: 'Sprint 2', status: 'done', points: 3 }),
		anIssue('OB-2', { sprint: 'Sprint 3', links: { ...anIssue('x').links, [IssueLinkKind.Blocks]: ['OB-10'] } }),
		anIssue('OB-3', { parent: 'OB-2' }),
	];
	const sprints = [
		aSprint('Sprint 3', { state: SprintState.Active, sequence: 3 }),
		aSprint('Sprint 2', { state: SprintState.Closed, sequence: 2, outcome: { completedIssues: ['OB-10'], carriedOverIssues: ['OB-2'], completedPoints: 3 } }),
	];
	const index = buildAgentIndex({ issues, sprints, workflow, keyPrefix: 'OB', locations }) as {
		active_sprint: string;
		sprints: { name: string; issues: string[]; completed_issues: string[] | null }[];
		backlog: string[];
		issues: { key: string; blocked_by: string[]; children: string[]; status_category: string; note: string }[];
	};

	it('answers sprint membership and history directly', () => {
		expect(index.active_sprint).toBe('Sprint 3');
		expect(index.sprints.map((s) => s.name)).toEqual(['Sprint 2', 'Sprint 3']);
		expect(index.sprints[0]?.completed_issues).toEqual(['OB-10']);
		expect(index.sprints[1]?.issues).toEqual(['OB-2']);
		expect(index.backlog).toEqual(['OB-3']);
	});

	it('lists issues by key number with inverse links, children and note paths', () => {
		expect(index.issues.map((i) => i.key)).toEqual(['OB-2', 'OB-3', 'OB-10']);
		expect(index.issues[2]).toMatchObject({ blocked_by: ['OB-2'], status_category: StatusCategory.Done, note: 'Projects/Board/issues/OB-10.md' });
		expect(index.issues[0]?.children).toEqual(['OB-3']);
	});

	it('documents the configured workflow in the guide', () => {
		const guide = renderAgentGuide({ workflow, keyPrefix: 'OB', locations });
		expect(guide).toContain('| `plan-created` | Plan Created | `todo` |');
		expect(guide).toContain('Projects/Board/index.json');
		expect(guide).toContain('`blocks` ↔ `blocked_by`');
	});
});

describe('settings', () => {
	it('repairs invalid persisted settings, project by project', () => {
		const settings = sanitizeSettings({
			projectsFolder: '/Work/',
			activeProject: 'Web',
			projects: {
				Web: { keyPrefix: 'bad', statuses: [{ id: 'x', name: 'X', category: 'todo' }], sprintLengthDays: -1 },
				Api: { keyPrefix: 'API', sprintLengthDays: 7, statuses: EXTENDED_WORKFLOW },
			},
		});
		expect(settings).toMatchObject({ projectsFolder: 'Work', activeProject: 'Web' });
		expect(settings.projects.Web).toMatchObject({ keyPrefix: 'WEB', sprintLengthDays: 14 });
		expect(settings.projects.Web?.statuses.map((s) => s.id)).toEqual(['todo', 'in-progress', 'done']);
		expect(settings.projects.Api).toMatchObject({ keyPrefix: 'API', sprintLengthDays: 7 });
		expect(settings.projects.Api?.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
	});

	it('never lets two projects share a key prefix', () => {
		const settings = sanitizeSettings({ projects: { Alpha: { keyPrefix: 'AB' }, Beta: { keyPrefix: 'AB' } } });
		expect(settings.projects.Alpha?.keyPrefix).toBe('AB');
		expect(settings.projects.Beta?.keyPrefix).toBe('BET');
	});

	it('starts with one default project when nothing is stored, and ignores unusable project names', () => {
		const settings = sanitizeSettings(null);
		expect(Object.keys(settings.projects)).toEqual([settings.activeProject]);
		expect(settings.projectsFolder).toBe('Projects');
		expect(Object.keys(sanitizeSettings({ projects: { 'a/b': {}, '.hidden': {}, Fine: {} } }).projects)).toEqual(['Fine']);
	});
});
