import { describe, expect, it, vi } from 'vitest';
import { SIMPLE_WORKFLOW, Workflow } from '../src/domain/workflow';
import { IssueItemCache } from '../src/ui/components/IssueItemCache';
import type { IssueItemModel } from '../src/ui/components/issueItem';
import { anIssue } from './fakes';

/** Renders fake elements and records how often each was removed from the page. */
function recordingRenderer() {
	const removals: ReturnType<typeof vi.fn>[] = [];
	const render = vi.fn(() => {
		const remove = vi.fn();
		removals.push(remove);
		return { remove } as unknown as HTMLElement;
	});
	const removalsOf = (index: number): number => removals[index]?.mock.calls.length ?? -1;
	return { render, removalsOf, count: () => removals.length };
}

function fakeParent() {
	const appendChild = vi.fn();
	return { parent: { appendChild } as unknown as HTMLElement, attachments: () => appendChild.mock.calls.length };
}

function model(key: string, overrides: Partial<IssueItemModel['issue']> = {}, openBlockers: string[] = []): IssueItemModel {
	return { issue: anIssue(key, overrides), status: new Workflow(SIMPLE_WORKFLOW).initialStatus, openBlockers, parentSummary: null };
}

describe('IssueItemCache', () => {
	it('draws an issue once and re-attaches the same element while nothing it shows has changed', () => {
		const { render } = recordingRenderer();
		const cache = new IssueItemCache(render);
		const { parent, attachments } = fakeParent();
		cache.attach(parent, model('OB-1'));
		cache.attach(parent, model('OB-1'));
		expect(render).toHaveBeenCalledTimes(1);
		expect(attachments()).toBe(1);
	});

	it('redraws, and discards the old element, when something displayed changes', () => {
		const { render, removalsOf, count } = recordingRenderer();
		const cache = new IssueItemCache(render);
		const { parent } = fakeParent();
		cache.attach(parent, model('OB-1'));
		cache.attach(parent, model('OB-1', { summary: 'New summary' }));
		cache.attach(parent, model('OB-1', { summary: 'New summary' }, ['OB-2']));
		expect(count()).toBe(3);
		expect([removalsOf(0), removalsOf(1), removalsOf(2)]).toEqual([1, 1, 0]);
	});

	it('forgets issues that no longer exist', () => {
		const { render, removalsOf } = recordingRenderer();
		const cache = new IssueItemCache(render);
		const { parent } = fakeParent();
		cache.attach(parent, model('OB-1'));
		cache.attach(parent, model('OB-2'));
		cache.keepOnly(new Set(['OB-2']));
		expect([removalsOf(0), removalsOf(1)]).toEqual([1, 0]);
		cache.attach(parent, model('OB-1'));
		expect(render).toHaveBeenCalledTimes(3);
	});
});
