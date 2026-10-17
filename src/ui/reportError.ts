import { Notice } from 'obsidian';
import { ObsidiboardError } from '../domain/errors';

/** Shows expected failures as a notice; logs anything unexpected. */
export function reportError(error: unknown): void {
	if (error instanceof ObsidiboardError) {
		new Notice(error.message);
		return;
	}
	console.error('Obsidiboard:', error);
	new Notice('Obsidiboard could not complete that action. See the developer console for details.');
}

/** Runs a fire-and-forget action, reporting any failure. */
export function runReporting(action: () => Promise<unknown>): void {
	action().catch(reportError);
}
