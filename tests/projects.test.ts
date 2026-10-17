import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectCommands } from '../src/application/ProjectCommands';
import {
	DuplicateKeyPrefixError,
	DuplicateProjectNameError,
	InvalidKeyPrefixError,
	InvalidProjectNameError,
	InvalidSprintLengthError,
	UnknownProjectError,
} from '../src/domain/errors';
import { assertValidProjectName, isValidProjectName, suggestKeyPrefix } from '../src/domain/project';
import { dominantKeyPrefix } from '../src/domain/issueKey';
import { projectFolderChange } from '../src/infrastructure/projectFolderChanges';
import { EXTENDED_WORKFLOW, SIMPLE_WORKFLOW } from '../src/domain/workflow';
import { locationsFor } from '../src/infrastructure/boardLocations';
import { issueFrontmatter, readIssue, writeIssueChanges } from '../src/infrastructure/frontmatter/issueFrontmatter';
import { toPathWikilink } from '../src/infrastructure/frontmatter/values';
import { sanitizeSettings, SettingsStore } from '../src/settings/settings';
import { anIssue } from './fakes';
import { FakeFolders, FakeRegistry, RecordingSettler } from './projectFakes';

describe('project names and key prefixes', () => {
	it('accepts names that work as folder names and rejects the rest', () => {
		['Website', 'Web shop', 'Q4 2026'].forEach((name) => {
			expect(() => assertValidProjectName(name)).not.toThrow();
			expect(isValidProjectName(name)).toBe(true);
		});
		['', ' Web', 'Web ', 'a/b', 'a:b', '.hidden', 'Issues', 'SPRINTS', 'a#b', '__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach((name) =>
			expect(() => assertValidProjectName(name)).toThrow(InvalidProjectNameError),
		);
	});

	it('suggests initials or the first letters, and avoids prefixes already in use', () => {
		const none = new Set<string>();
		expect(suggestKeyPrefix('Web Shop', none)).toBe('WS');
		expect(suggestKeyPrefix('Website', none)).toBe('WEB');
		expect(suggestKeyPrefix('2026 plans', none)).toBe('P');
		expect(suggestKeyPrefix('???', none)).toBe('PRJ');
		expect(suggestKeyPrefix('Website', new Set(['WEB', 'WEB2']))).toBe('WEB3');
	});
});

describe('locations', () => {
	it('puts each project in its own folder under the projects folder', () => {
		expect(locationsFor('Projects', 'Web')).toMatchObject({
			projectsFolder: 'Projects',
			projectName: 'Web',
			boardFolder: 'Projects/Web',
			issuesFolder: 'Projects/Web/issues',
			sprintsFolder: 'Projects/Web/sprints',
			agentIndexPath: 'Projects/Web/index.json',
		});
	});
});

describe('sprint links', () => {
	const sprintReference = (name: string) => toPathWikilink('Projects/Web/sprints', name);

	it('include the sprints folder, so projects with the same sprint names stay distinct, and read back as the plain name', () => {
		const frontmatter = issueFrontmatter(anIssue('WEB-1', { sprint: 'Sprint 1' }), sprintReference);
		expect(frontmatter.sprint).toBe('[[Projects/Web/sprints/Sprint 1|Sprint 1]]');
		expect(readIssue('WEB-1', frontmatter, 'todo').sprint).toBe('Sprint 1');
		writeIssueChanges(frontmatter, { sprint: 'Sprint 2' }, sprintReference);
		expect(readIssue('WEB-1', frontmatter, 'todo').sprint).toBe('Sprint 2');
	});

	it('leave issue-to-issue links as the bare key', () => {
		expect(issueFrontmatter(anIssue('WEB-2', { parent: 'WEB-1' }), sprintReference).parent).toBe('[[WEB-1]]');
	});
});

describe('ProjectCommands', () => {
	let registry: FakeRegistry;
	let folders: FakeFolders;
	let commands: ProjectCommands;

	beforeEach(() => {
		registry = new FakeRegistry(
			'Alpha',
			new Map([['Alpha', { keyPrefix: 'AL', sprintLengthDays: 7, statuses: EXTENDED_WORKFLOW, repository: null }]]),
		);
		folders = new FakeFolders();
		['Alpha', 'Beta'].forEach((name) => folders.existing.add(name));
		commands = new ProjectCommands(registry, folders, new RecordingSettler(registry.log));
	});

	it('lists folders, configured projects and the active project once, sorted', () => {
		registry.projects.set('gamma', { keyPrefix: 'GA', sprintLengthDays: 14, statuses: SIMPLE_WORKFLOW, repository: null });
		expect(commands.names()).toEqual(['Alpha', 'Beta', 'gamma']);
	});

	it('creates a project: folders, settings copied from the active project with its own prefix, and switches to it', async () => {
		await commands.create('Web shop', 'WS');
		expect(folders.existing.has('Web shop')).toBe(true);
		expect(registry.projects.get('Web shop')).toMatchObject({ keyPrefix: 'WS', sprintLengthDays: 7 });
		expect(registry.projects.get('Web shop')?.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
		expect(registry.activeProject).toBe('Web shop');
	});

	it('rejects bad names, existing names in any letter case, and bad or used prefixes, creating nothing', async () => {
		await expect(commands.create('a/b', 'AB')).rejects.toThrow(InvalidProjectNameError);
		await expect(commands.create('beta', 'BE')).rejects.toThrow(DuplicateProjectNameError);
		await expect(commands.create('Gamma', 'ga')).rejects.toThrow(InvalidKeyPrefixError);
		await expect(commands.create('Gamma', 'AL')).rejects.toThrow(DuplicateKeyPrefixError);
		expect(folders.existing.has('Gamma')).toBe(false);
		expect(registry.activeProject).toBe('Alpha');
	});

	it('switches to a project, giving a folder it has not seen before default settings with a free prefix', async () => {
		await commands.switchTo('Beta');
		expect(registry.activeProject).toBe('Beta');
		expect(registry.projects.get('Beta')).toMatchObject({ keyPrefix: 'BET', sprintLengthDays: 7 });
		await expect(commands.switchTo('Nope')).rejects.toThrow(UnknownProjectError);
	});

	it('changes the active project key prefix and sprint length, keeping prefixes unique', async () => {
		await commands.switchTo('Beta');
		await commands.changeKeyPrefix('BX');
		await expect(commands.changeKeyPrefix('AL')).rejects.toThrow(DuplicateKeyPrefixError);
		await commands.changeKeyPrefix('BX');
		await commands.changeSprintLength(21);
		await expect(commands.changeSprintLength(0)).rejects.toThrow(InvalidSprintLengthError);
		expect(registry.projects.get('Beta')).toMatchObject({ keyPrefix: 'BX', sprintLengthDays: 21 });
		expect(registry.projects.get('Alpha')?.keyPrefix).toBe('AL');
	});
});

describe('SettingsStore with several projects', () => {
	const stored = {
		projectsFolder: 'Projects',
		activeProject: 'Alpha',
		projects: {
			Alpha: { keyPrefix: 'AL', sprintLengthDays: 7, statuses: EXTENDED_WORKFLOW },
			Beta: { keyPrefix: 'BE', sprintLengthDays: 14, statuses: SIMPLE_WORKFLOW },
		},
	};
	let saved: number;
	let store: SettingsStore;

	beforeEach(() => {
		saved = 0;
		store = new SettingsStore(sanitizeSettings(stored), async () => {
			saved++;
		});
	});

	it('exposes the active project to the rest of the plugin, and follows a switch', async () => {
		expect(store).toMatchObject({ keyPrefix: 'AL', sprintLengthDays: 7, issuesFolder: 'Projects/Alpha/issues' });
		expect(store.workflow.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
		let notified = 0;
		store.onChange(() => notified++);
		await store.activate('Beta');
		expect(store).toMatchObject({ keyPrefix: 'BE', sprintLengthDays: 14, sprintsFolder: 'Projects/Beta/sprints', projectName: 'Beta' });
		expect(store.workflow.statuses).toHaveLength(SIMPLE_WORKFLOW.length);
		expect([saved, notified]).toEqual([1, 1]);
	});

	it('saves statuses for the active project only', async () => {
		await store.activate('Beta');
		await store.saveStatuses([...SIMPLE_WORKFLOW, { id: 'qa', name: 'QA', category: SIMPLE_WORKFLOW[1]!.category }]);
		expect(store.workflow.statuses).toHaveLength(SIMPLE_WORKFLOW.length + 1);
		await store.activate('Alpha');
		expect(store.workflow.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
	});

	it('refuses to switch to a project without settings, and to store an invalid workflow', async () => {
		await expect(store.activate('Nope')).rejects.toThrow(UnknownProjectError);
		await expect(store.saveStatuses([])).rejects.toThrow();
		expect(store.workflow.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
	});
});

describe('adopting an existing project folder', () => {
	it('infers the key prefix from the most common one among its issue notes', () => {
		expect(dominantKeyPrefix(['SITE-1', 'SITE-2', 'WEB-3', 'notes', 'Sprint 1'])).toBe('SITE');
		expect(dominantKeyPrefix(['B-1', 'A-1'])).toBe('A');
		expect(dominantKeyPrefix(['readme'])).toBeNull();
	});
});

describe('ProjectCommands switching', () => {
	let registry: FakeRegistry;
	let folders: FakeFolders;
	let commands: ProjectCommands;

	beforeEach(() => {
		registry = new FakeRegistry(
			'Alpha',
			new Map([['Alpha', { keyPrefix: 'AL', sprintLengthDays: 7, statuses: EXTENDED_WORKFLOW, repository: null }]]),
		);
		folders = new FakeFolders();
		folders.existing.add('Alpha');
		folders.existing.add('Website');
		commands = new ProjectCommands(registry, folders, new RecordingSettler(registry.log));
	});

	it('lets pending work finish before the board moves to another project', async () => {
		await commands.switchTo('Website');
		expect(registry.log).toEqual(['settle', 'save Website', 'activate Website']);
	});

	it('also settles before switching to a project it has just created', async () => {
		await commands.create('Gamma', 'GA');
		expect(registry.log).toEqual(['save Gamma', 'settle', 'activate Gamma']);
	});

	it('gives an adopted folder the prefix its notes already use, not one derived from its name', async () => {
		folders.notes.set('Website', ['SITE-1', 'SITE-2', 'SITE-3']);
		await commands.switchTo('Website');
		expect(registry.projects.get('Website')?.keyPrefix).toBe('SITE');
	});

	it('falls back to a derived prefix when the notes use a prefix another project already has', async () => {
		folders.notes.set('Website', ['AL-1', 'AL-2']);
		await commands.switchTo('Website');
		expect(registry.projects.get('Website')?.keyPrefix).toBe('WEB');
	});

	it('treats names that differ only in letter case as one project', () => {
		folders.existing.add('website');
		folders.existing.add('ALPHA');
		expect(commands.names()).toEqual(['Alpha', 'Website']);
	});
});

describe('project folders changed in the file explorer', () => {
	it('reads renames and deletions of direct subfolders of the projects folder', () => {
		expect(projectFolderChange('Projects', 'Projects/A', 'Projects/B')).toEqual({ kind: 'renamed', from: 'A', to: 'B' });
		expect(projectFolderChange('Projects', 'Projects/A', null)).toEqual({ kind: 'removed', name: 'A' });
		expect(projectFolderChange('Projects', 'Projects/A', 'Archive/A')).toEqual({ kind: 'removed', name: 'A' });
	});

	it('ignores folders inside a project, outside the projects folder, or moved in from elsewhere', () => {
		expect(projectFolderChange('Projects', 'Projects/A/issues', 'Projects/A/tickets')).toBeNull();
		expect(projectFolderChange('Projects', 'Other/A', 'Other/B')).toBeNull();
		expect(projectFolderChange('Projects', 'Elsewhere/A', 'Projects/A')).toBeNull();
		expect(projectFolderChange('Projects', 'Projects', null)).toBeNull();
	});
});

describe('SettingsStore project names and folder changes', () => {
	const settings = (extra: Record<string, unknown> = {}) => ({
		projectsFolder: 'Projects',
		activeProject: 'Alpha',
		projects: {
			Alpha: { keyPrefix: 'AL', sprintLengthDays: 7, statuses: EXTENDED_WORKFLOW },
			Beta: { keyPrefix: 'BE', sprintLengthDays: 14, statuses: SIMPLE_WORKFLOW },
		},
		...extra,
	});
	const storeOf = (raw: unknown) => new SettingsStore(sanitizeSettings(raw), async () => undefined);

	it('keeps a renamed project\'s settings, and follows it when it is the active one', async () => {
		const store = storeOf(settings());
		await store.renameProject('Alpha', 'Core');
		expect(store).toMatchObject({ activeProject: 'Core', keyPrefix: 'AL', sprintLengthDays: 7 });
		expect(store.workflow.statuses).toHaveLength(EXTENDED_WORKFLOW.length);
		expect([...store.configuredProjects().keys()].sort()).toEqual(['Beta', 'Core']);
	});

	it('forgets a deleted project and moves the board to another one if it was active', async () => {
		const store = storeOf(settings());
		await store.removeProject('Alpha');
		expect(store.activeProject).toBe('Beta');
		expect(store.keyPrefix).toBe('BE');
		await store.removeProject('Beta');
		expect(store.configuredProjects().size).toBe(1);
		expect(store.keyPrefix).not.toBeUndefined();
	});

	it('treats a rename to an unusable name as a deletion, and an unknown project as nothing to do', async () => {
		const store = storeOf(settings());
		await store.renameProject('Beta', '.archive');
		expect([...store.configuredProjects().keys()]).toEqual(['Alpha']);
		await store.renameProject('Nope', 'Other');
		await store.removeProject('Nope');
		expect([...store.configuredProjects().keys()]).toEqual(['Alpha']);
	});

	it('cannot be fooled by names every object already has', async () => {
		const polluted = JSON.parse('{"activeProject":"constructor","projects":{"__proto__":{"keyPrefix":"PX"},"toString":{},"Real":{"keyPrefix":"RE"}}}') as unknown;
		const store = storeOf(polluted);
		expect(Object.keys(store.settings.projects)).toEqual(['Real']);
		expect(store.activeProject).toBe('Real');
		expect(store.keyPrefix).toBe('RE');
		await expect(store.activate('constructor')).rejects.toThrow(UnknownProjectError);
		await expect(store.saveProject('__proto__', { keyPrefix: 'PX', sprintLengthDays: 14, statuses: SIMPLE_WORKFLOW, repository: null })).rejects.toThrow(InvalidProjectNameError);
	});

	it('merges project names that differ only in letter case, keeping the first and matching the active one to it', () => {
		const sanitized = sanitizeSettings({ activeProject: 'web', projects: { Web: { keyPrefix: 'WEB' }, WEB: { keyPrefix: 'XX' }, web: {} } });
		expect(Object.keys(sanitized.projects)).toEqual(['Web']);
		expect(sanitized.activeProject).toBe('Web');
	});
});
