const ISSUE_MIME_TYPE = 'application/x-boardmd-issue';
const ITEM_SELECTOR = ':scope > [data-issue-key]';
const DROP_BEFORE_CLASS = 'boardmd-drop-before';
const DROP_AT_END_CLASS = 'boardmd-drop-at-end';

/** Called with the dragged issue and the issue it was dropped in front of (null = at the end). */
export type IssueDropHandler = (key: string, beforeKey: string | null) => void;

const EMPTY_MESSAGE_SELECTOR = ':scope > .boardmd-empty';

/** The element being dragged right now, so a drop can move it before the data round trip finishes. */
let draggedElement: HTMLElement | null = null;

export function makeIssueDraggable(element: HTMLElement, key: string): void {
	element.draggable = true;
	element.dataset.issueKey = key;
	element.addEventListener('dragstart', (event) => {
		draggedElement = element;
		event.dataTransfer?.setData(ISSUE_MIME_TYPE, key);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		element.addClass('is-dragging');
	});
	element.addEventListener('dragend', () => {
		element.removeClass('is-dragging');
		draggedElement = null;
	});
}

/** Turns a container of draggable issues into an ordered drop target. */
export function makeIssueDropList(list: HTMLElement, onDrop: IssueDropHandler): void {
	list.addEventListener('dragover', (event) => {
		if (!carriesIssue(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		showIndicator(list, itemAfterPointer(list, event.clientY));
	});
	list.addEventListener('dragleave', (event) => {
		if (!(event.relatedTarget instanceof Node) || !list.contains(event.relatedTarget)) clearIndicator(list);
	});
	list.addEventListener('drop', (event) => {
		const key = event.dataTransfer?.getData(ISSUE_MIME_TYPE);
		clearIndicator(list);
		if (!key) return;
		event.preventDefault();
		const beforeKey = beforeKeyFor(key, itemAfterPointer(list, event.clientY));
		moveDraggedElement(list, beforeKey);
		onDrop(key, beforeKey);
	});
}

/**
 * Shows the move immediately. Saving the note and re-reading it from the metadata cache takes a
 * moment, during which the card would otherwise snap back to where it started. The next render
 * replaces this element with the stored result (or restores the old position if saving failed).
 */
function moveDraggedElement(list: HTMLElement, beforeKey: string | null): void {
	if (!draggedElement) return;
	list.querySelectorAll(EMPTY_MESSAGE_SELECTOR).forEach((message) => message.remove());
	const before = beforeKey === null ? null : items(list).find((item) => item.dataset.issueKey === beforeKey) ?? null;
	list.insertBefore(draggedElement, before);
}

function carriesIssue(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes(ISSUE_MIME_TYPE) ?? false;
}

function items(list: HTMLElement): HTMLElement[] {
	return Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

/** First item whose vertical midpoint lies below the pointer. */
function itemAfterPointer(list: HTMLElement, clientY: number): HTMLElement | null {
	return (
		items(list).find((item) => {
			const box = item.getBoundingClientRect();
			return clientY < box.top + box.height / 2;
		}) ?? null
	);
}

/** Dropping an item just above itself keeps it in place, i.e. before its next sibling. */
function beforeKeyFor(draggedKey: string, target: HTMLElement | null): string | null {
	if (target?.dataset.issueKey !== draggedKey) return target?.dataset.issueKey ?? null;
	const siblings = items(target.parentElement as HTMLElement);
	return siblings[siblings.indexOf(target) + 1]?.dataset.issueKey ?? null;
}

function showIndicator(list: HTMLElement, target: HTMLElement | null): void {
	clearIndicator(list);
	if (target) target.addClass(DROP_BEFORE_CLASS);
	else list.addClass(DROP_AT_END_CLASS);
}

function clearIndicator(list: HTMLElement): void {
	list.removeClass(DROP_AT_END_CLASS);
	items(list).forEach((item) => item.removeClass(DROP_BEFORE_CLASS));
}
