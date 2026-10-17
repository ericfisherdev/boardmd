import { Issue } from '../../domain/issue';
import { StatusDefinition } from '../../domain/workflow';
import { makeIssueDraggable } from '../dragAndDrop';
import {
	renderAssignee,
	renderBlockedFlag,
	renderKey,
	renderParent,
	renderPoints,
	renderPriorityIcon,
	renderStatusPill,
	renderTypeIcon,
} from './issueBadges';

/** What an issue row or card can ask its view to do. */
export interface IssueItemActions {
	/** Plain activation (click, Enter): the edit form. */
	edit(key: string): void;
	/** Ctrl/Cmd activation: the issue's note, in a new tab. */
	open(key: string, newTab: boolean): void;
	showMenuAtMouse(key: string, event: MouseEvent): void;
	showMenuBelow(key: string, anchor: HTMLElement): void;
}

/** Everything needed to draw one issue, resolved by the view. */
export interface IssueItemModel {
	readonly issue: Issue;
	readonly status: StatusDefinition;
	readonly openBlockers: readonly string[];
	readonly parentSummary: string | null;
}

/** Compact single-line row for backlog and sprint lists. */
export function renderIssueRow(parent: HTMLElement, model: IssueItemModel, actions: IssueItemActions): HTMLElement {
	const { issue } = model;
	const row = createInteractiveItem(parent, 'obsidiboard-row', model, actions);
	renderTypeIcon(row, issue);
	renderKey(row, issue);
	row.createSpan({ cls: 'obsidiboard-summary', text: issue.summary });
	renderBlockedFlag(row, model.openBlockers);
	renderParent(row, issue, model.parentSummary);
	renderStatusPill(row, model.status);
	renderAssignee(row, issue);
	renderPriorityIcon(row, issue);
	renderPoints(row, issue);
	return row;
}

/** Card for board columns. */
export function renderIssueCard(parent: HTMLElement, model: IssueItemModel, actions: IssueItemActions): HTMLElement {
	const { issue } = model;
	const card = createInteractiveItem(parent, 'obsidiboard-card', model, actions);
	card.createDiv({ cls: 'obsidiboard-summary', text: issue.summary });
	const tags = card.createDiv({ cls: 'obsidiboard-card-tags' });
	renderParent(tags, issue, model.parentSummary);
	renderBlockedFlag(tags, model.openBlockers);
	const footer = card.createDiv({ cls: 'obsidiboard-card-footer' });
	renderTypeIcon(footer, issue);
	renderKey(footer, issue);
	footer.createSpan({ cls: 'obsidiboard-spacer' });
	renderPriorityIcon(footer, issue);
	renderPoints(footer, issue);
	renderAssignee(footer, issue);
	return card;
}

function createInteractiveItem(
	parent: HTMLElement,
	cls: string,
	model: IssueItemModel,
	actions: IssueItemActions,
): HTMLElement {
	const { key, summary } = model.issue;
	const item = parent.createDiv({
		cls,
		attr: { tabindex: '0', role: 'button', 'aria-label': `${key} ${summary}. Press Enter to edit, Ctrl+Enter to open the note, Shift+F10 for actions.` },
	});
	makeIssueDraggable(item, key);
	item.addEventListener('click', (event) => activate(key, event, actions));
	item.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		actions.showMenuAtMouse(key, event);
	});
	item.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') activate(key, event, actions);
		else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
			event.preventDefault();
			actions.showMenuBelow(key, item);
		}
	});
	return item;
}

function activate(key: string, event: MouseEvent | KeyboardEvent, actions: IssueItemActions): void {
	if (event.ctrlKey || event.metaKey) actions.open(key, true);
	else actions.edit(key);
}
