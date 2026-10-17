import { RepositoryRequestError, RepositoryTooLargeError } from '../../domain/errors';
import { HttpClient, HttpResponse } from './HttpClient';

export const ISSUES_PER_PAGE = 100;
const MAX_PAGES = 30;

/**
 * Reads every page of a list endpoint and returns the items of all pages.
 * Only follows `next` links on the same site as the first request, so a token is never sent elsewhere.
 * @throws RepositoryRequestError, RepositoryTooLargeError
 */
export async function fetchAllPages(http: HttpClient, firstUrl: string, headers: Readonly<Record<string, string>>): Promise<unknown[]> {
	const origin = new URL(firstUrl).origin;
	const items: unknown[] = [];
	let url: string | null = firstUrl;
	for (let page = 1; url !== null; page++) {
		if (page > MAX_PAGES) throw new RepositoryTooLargeError(MAX_PAGES * ISSUES_PER_PAGE);
		const response: HttpResponse = await http.get(url, headers);
		assertSuccess(response);
		if (!Array.isArray(response.json)) throw new RepositoryRequestError(response.status, 'the server did not answer with a list of issues.');
		items.push(...(response.json as unknown[]));
		url = nextPageUrl(response.headers['link'], origin);
	}
	return items;
}

/** The `rel="next"` address in a Link header, if it is on `origin`. */
export function nextPageUrl(linkHeader: string | undefined, origin: string): string | null {
	if (!linkHeader) return null;
	for (const part of linkHeader.split(',')) {
		const match = /<([^>]+)>\s*;[^,]*\brel="?next"?/.exec(part);
		if (!match?.[1]) continue;
		try {
			return new URL(match[1]).origin === origin ? match[1] : null;
		} catch {
			return null;
		}
	}
	return null;
}

/** @throws RepositoryRequestError with a reason the user can act on. */
function assertSuccess({ status, headers }: HttpResponse): void {
	if (status >= 200 && status < 300) return;
	if (status === 401) throw new RepositoryRequestError(status, 'the access token was rejected. Check that it is valid and has not expired.');
	if (status === 404) throw new RepositoryRequestError(status, 'the repository was not found, or the access token cannot see it.');
	if (status === 429 || (status === 403 && headers['x-ratelimit-remaining'] === '0')) {
		throw new RepositoryRequestError(status, 'the rate limit was reached. Add an access token or try again later.');
	}
	if (status === 403) throw new RepositoryRequestError(status, 'access was denied. The access token may lack permission to read issues.');
	throw new RepositoryRequestError(status, `the server answered with status ${status}.`);
}
