import { HttpClient, HttpResponse } from '../src/infrastructure/repositories/HttpClient';
import { GitHubIssueSource, GitLabIssueSource } from '../src/infrastructure/repositories/RepositoryIssueSources';

export interface RecordedRequest {
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
}

/** Scripted HTTP answers, in order, and the requests that were made. */
export class FakeHttpClient implements HttpClient {
	readonly requests: RecordedRequest[] = [];
	private readonly answers: HttpResponse[] = [];
	private repeated: HttpResponse | null = null;

	respond(status: number, json: unknown, headers: Record<string, string> = {}): void {
		this.answers.push({ status, headers, json });
	}

	respondForever(status: number, json: unknown, headers: Record<string, string> = {}): void {
		this.repeated = { status, headers, json };
	}

	get(url: string, headers: Readonly<Record<string, string>>): Promise<HttpResponse> {
		this.requests.push({ url, headers });
		const answer = this.answers.shift() ?? this.repeated;
		if (!answer) throw new Error(`No scripted answer for ${url}`);
		return Promise.resolve(answer);
	}
}

/** Both clients over one scripted HTTP client. */
export class RepositoryIssueSource extends FakeHttpClient {
	readonly github = new GitHubIssueSource(this);
	readonly gitlab = new GitLabIssueSource(this);
}
