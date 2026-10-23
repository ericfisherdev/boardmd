import { Component } from 'obsidian';
import { BoardSnapshot } from '../../application/BoardSnapshot';
import { ChangeFeed } from '../../application/ports';
import { Issue } from '../../domain/issue';
import { IssueNavigator } from '../../infrastructure/WorkspaceIssueNavigator';
import { IssueItemActions, IssueItemModel } from '../components/issueItem';
import { IssueDialogs } from '../IssueDialogs';
import { IssueMenu } from '../IssueMenu';
import { reportError, runReporting } from '../reportError';

export const BACKLOG_VIEW_TYPE = 'boardmd-backlog';
export const SPRINT_BOARD_VIEW_TYPE = 'boardmd-sprint-board';

/** Opens the plugin's views; implemented by the plugin. */
export interface BoardViewOpener {
	openBacklog(): Promise<void>;
	openSprintBoard(): Promise<void>;
}

const SCROLL_KEY_ATTRIBUTE = 'data-scroll-key';

/** Marks an element whose scroll position should survive re-renders. */
export function keepScroll(element: HTMLElement, key: string): void {
	element.setAttribute(SCROLL_KEY_ATTRIBUTE, key);
}

/**
 * Renders now and after every board change until the owner unloads, keeping scroll positions.
 * @returns a function that re-renders the same way, for view-local changes such as filtering.
 */
export function renderLive(owner: Component, root: HTMLElement, feed: ChangeFeed, render: () => void): () => void {
	const rerender = () => withPreservedScroll(root, render);
	owner.register(feed.subscribe(rerender));
	rerender();
	return rerender;
}

function withPreservedScroll(root: HTMLElement, render: () => void): void {
	const positions = new Map<string, [number, number]>();
	const scrollables = () => Array.from(root.querySelectorAll<HTMLElement>(`[${SCROLL_KEY_ATTRIBUTE}]`));
	scrollables().forEach((el) => positions.set(el.getAttribute(SCROLL_KEY_ATTRIBUTE) ?? '', [el.scrollTop, el.scrollLeft]));
	const rootPosition: [number, number] = [root.scrollTop, root.scrollLeft];
	render();
	[root.scrollTop, root.scrollLeft] = rootPosition;
	scrollables().forEach((el) => {
		const saved = positions.get(el.getAttribute(SCROLL_KEY_ATTRIBUTE) ?? '');
		if (saved) [el.scrollTop, el.scrollLeft] = saved;
	});
}

/** Resolves an issue's status, open blockers and parent for display, from one board snapshot. */
export function itemModelFactory(snapshot: BoardSnapshot): (issue: Issue) => IssueItemModel {
	const { workflow, graph } = snapshot;
	const isDone = (statusId: string) => workflow.isDone(statusId);
	return (issue) => ({
		issue,
		status: workflow.resolve(issue.status),
		openBlockers: graph.openBlockersOf(issue.key, isDone),
		parentSummary: issue.parent === null ? null : (snapshot.issue(issue.parent)?.summary ?? null),
	});
}

export function issueItemActions(navigator: IssueNavigator, menu: IssueMenu, dialogs: IssueDialogs): IssueItemActions {
	return {
		edit: (key) => dialogs.editDetails(key),
		open: (key, newTab) => runReporting(() => navigator.open(key, newTab)),
		showMenuAtMouse: (key, event) => menu.showAtMouse(key, event),
		showMenuBelow: (key, anchor) => menu.showBelow(key, anchor),
	};
}

/** Runs a drop action; if it fails, reports the error and re-renders so the optimistic move is undone. */
export function runDrop(action: () => Promise<unknown>, restore: () => void): void {
	action().catch((error: unknown) => {
		reportError(error);
		restore();
	});
}

/** Case-insensitive match on key, summary or assignee; blank queries match everything. */
export function matchesFilter(issue: Issue, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (needle === '') return true;
	return [issue.key, issue.summary, issue.assignee ?? ''].some((field) => field.toLowerCase().includes(needle));
}
