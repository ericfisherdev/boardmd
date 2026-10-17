import { requestUrl } from 'obsidian';
import { RepositoryRequestError } from '../../domain/errors';
import { HttpClient, HttpResponse } from './HttpClient';

/** HTTP through Obsidian, which is not bound by browser cross-origin rules. */
export class ObsidianHttpClient implements HttpClient {
	async get(url: string, headers: Readonly<Record<string, string>>): Promise<HttpResponse> {
		try {
			const response = await requestUrl({ url, method: 'GET', headers: { ...headers }, throw: false });
			return {
				status: response.status,
				headers: lowerCaseKeys(response.headers),
				json: response.status >= 200 && response.status < 300 ? parseJson(response.text) : null,
			};
		} catch {
			throw new RepositoryRequestError(null, 'the server could not be reached. Check your connection and the host name.');
		}
	}
}

function lowerCaseKeys(headers: Readonly<Record<string, string>>): Record<string, string> {
	return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}
