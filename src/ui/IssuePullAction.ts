import { Notice } from 'obsidian';
import { IssuePullCommands, PullSummary } from '../application/IssuePullCommands';
import { reportError } from './reportError';

/** Pulls issues from the linked repository and tells the user what happened. */
export class IssuePullAction {
	constructor(private readonly pull: IssuePullCommands) {}

	run(): void {
		new Notice('Pulling issues…', 2000);
		this.pull
			.pull()
			.then((summary) => new Notice(describePull(summary)))
			.catch(reportError);
	}
}

export function describePull({ created, updated, unchanged }: PullSummary): string {
	if (created === 0 && updated === 0) return unchanged === 0 ? 'No issues to pull.' : `Already up to date (${unchanged} issues checked).`;
	const parts = [`${created} new`, `${updated} updated`];
	return `Pulled issues: ${parts.join(', ')}.`;
}
