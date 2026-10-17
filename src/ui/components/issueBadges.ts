import { setIcon, setTooltip } from 'obsidian';
import { Issue } from '../../domain/issue';
import { StatusDefinition } from '../../domain/workflow';
import { ISSUE_TYPE_PRESENTATION, pointsLabel, PRIORITY_PRESENTATION } from '../labels';

export function renderTypeIcon(parent: HTMLElement, issue: Issue): void {
	const { label, icon } = ISSUE_TYPE_PRESENTATION[issue.type];
	const el = parent.createSpan({ cls: `obsidiboard-type obsidiboard-type-${issue.type}`, attr: { 'aria-label': label } });
	setIcon(el, icon);
	setTooltip(el, label);
}

export function renderPriorityIcon(parent: HTMLElement, issue: Issue): void {
	const { label, icon } = PRIORITY_PRESENTATION[issue.priority];
	const el = parent.createSpan({
		cls: `obsidiboard-priority obsidiboard-priority-${issue.priority}`,
		attr: { 'aria-label': `${label} priority` },
	});
	setIcon(el, icon);
	setTooltip(el, `${label} priority`);
}

export function renderKey(parent: HTMLElement, issue: Issue): void {
	parent.createSpan({ cls: 'obsidiboard-key', text: issue.key });
}

export function renderStatusPill(parent: HTMLElement, status: StatusDefinition): void {
	parent.createSpan({ cls: `obsidiboard-status obsidiboard-status-${status.category}`, text: status.name });
}

export function renderPoints(parent: HTMLElement, issue: Issue): void {
	if (issue.points === null) return;
	const el = parent.createSpan({ cls: 'obsidiboard-points', text: String(issue.points) });
	setTooltip(el, pointsLabel(issue.points));
}

export function renderAssignee(parent: HTMLElement, issue: Issue): void {
	if (issue.assignee === null) return;
	const el = parent.createSpan({ cls: 'obsidiboard-assignee', text: initials(issue.assignee) });
	setTooltip(el, issue.assignee);
}

/** Warns that unfinished issues block this one. */
export function renderBlockedFlag(parent: HTMLElement, openBlockers: readonly string[]): void {
	if (openBlockers.length === 0) return;
	const label = `Blocked by ${openBlockers.join(', ')}`;
	const el = parent.createSpan({ cls: 'obsidiboard-blocked', attr: { 'aria-label': label } });
	setIcon(el, 'octagon-alert');
	setTooltip(el, label);
}

export function renderParent(parent: HTMLElement, issue: Issue, parentSummary: string | null): void {
	if (issue.parent === null) return;
	const el = parent.createSpan({ cls: 'obsidiboard-parent', text: parentSummary ?? issue.parent });
	setTooltip(el, `Parent: ${issue.parent}`);
}

function initials(name: string): string {
	const letters = name
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => Array.from(part)[0] ?? '')
		.join('');
	return Array.from(letters).slice(0, 2).join('').toUpperCase();
}
