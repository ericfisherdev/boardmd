import { describe, expect, it } from 'vitest';
import { IssueNotFoundError } from '../src/domain/errors';
import { IssueLinkKind } from '../src/domain/issue';
import { SIMPLE_WORKFLOW, Workflow } from '../src/domain/workflow';
import { locationsFor } from '../src/infrastructure/boardLocations';
import { Frontmatter } from '../src/infrastructure/frontmatter/values';
import { NoteRecord, VaultNoteStore } from '../src/infrastructure/VaultNoteStore';
import { VaultIssueRepository } from '../src/infrastructure/VaultIssueRepository';

/** Stands in for the vault: notes by name, with the frontmatter object Obsidian's cache would hand out. */
class FakeNoteStore {
	readonly notes = new Map<string, Frontmatter>();

	list(): NoteRecord[] {
		return [...this.notes].map(([basename, frontmatter]) => ({ basename, frontmatter }));
	}

	read(_folder: string, basename: string): NoteRecord | null {
		const frontmatter = this.notes.get(basename);
		return frontmatter ? { basename, frontmatter } : null;
	}

	file(): null {
		return null;
	}

	async updateFrontmatter(_folder: string, basename: string, mutate: (frontmatter: Frontmatter) => void): Promise<boolean> {
		const frontmatter = this.notes.get(basename);
		if (!frontmatter) return false;
		mutate(frontmatter);
		return true;
	}
}

function repositoryOver(store: FakeNoteStore): VaultIssueRepository {
	return new VaultIssueRepository(store as unknown as VaultNoteStore, locationsFor('Projects', 'Board'), () => new Workflow(SIMPLE_WORKFLOW));
}

describe('VaultIssueRepository', () => {
	it('parses a note once while the cache hands back the same frontmatter object', () => {
		const store = new FakeNoteStore();
		store.notes.set('OB-1', { summary: 'First' });
		const repository = repositoryOver(store);
		const first = repository.findByKey('OB-1');
		expect(first).not.toBeNull();
		expect(repository.findAll()).toEqual([first]);
		expect(repository.findAll()[0]).toBe(first);
		expect(repository.findByKey('OB-1')).toBe(first);
	});

	it('re-reads a note when Obsidian re-parses it, or its name changes', () => {
		const store = new FakeNoteStore();
		store.notes.set('OB-1', { summary: 'First' });
		const repository = repositoryOver(store);
		const before = repository.findByKey('OB-1');
		store.notes.set('OB-1', { summary: 'Renamed' });
		expect(repository.findByKey('OB-1')?.summary).toBe('Renamed');
		expect(repository.findByKey('OB-1')).not.toBe(before);
		const shared = { summary: 'Shared' };
		store.notes.set('OB-1', shared);
		repository.findAll();
		store.notes.delete('OB-1');
		store.notes.set('OB-2', shared);
		expect(repository.findAll().map((issue) => issue.key)).toEqual(['OB-2']);
	});

	it('changes links from the note as it is when the write happens', async () => {
		const store = new FakeNoteStore();
		store.notes.set('OB-1', { summary: 'First', blocks: ['[[OB-2]]'] });
		const repository = repositoryOver(store);
		repository.findAll();
		store.notes.get('OB-1')!.relates_to = ['[[OB-3]]'];
		await repository.updateLinks('OB-1', (links) => ({ ...links, [IssueLinkKind.Blocks]: [...links[IssueLinkKind.Blocks], 'OB-4'] }));
		expect(store.notes.get('OB-1')).toMatchObject({ blocks: ['[[OB-2]]', '[[OB-4]]'], relates_to: ['[[OB-3]]'] });
		await expect(repository.updateLinks('OB-9', (links) => links)).rejects.toThrow(IssueNotFoundError);
	});
});
