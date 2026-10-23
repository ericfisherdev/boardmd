import { Notice } from 'obsidian';
import { BoardMdError } from '../domain/errors';

/** Shows expected failures as a notice; logs anything unexpected. */
export function reportError(error: unknown): void {
	if (error instanceof BoardMdError) {
		new Notice(error.message);
		return;
	}
	console.error('BoardMD:', error);
	new Notice('That action could not be completed. See the developer console for details.');
}

/** Runs a fire-and-forget action, reporting any failure. */
export function runReporting(action: () => Promise<unknown>): void {
	action().catch(reportError);
}
