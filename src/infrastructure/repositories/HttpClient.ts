export interface HttpResponse {
	readonly status: number;
	/** Header names in lower case. */
	readonly headers: Readonly<Record<string, string>>;
	/** The parsed body of a successful response; null when it was not valid JSON. */
	readonly json: unknown;
}

/** Minimal HTTP access, so repository clients can be tested without a network. */
export interface HttpClient {
	/**
	 * Sends a GET request and returns the response whatever its status.
	 * @throws RepositoryRequestError when the server cannot be reached.
	 */
	get(url: string, headers: Readonly<Record<string, string>>): Promise<HttpResponse>;
}
