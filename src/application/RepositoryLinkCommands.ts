import { UnknownProjectError } from '../domain/errors';
import { ProjectSettings } from '../domain/project';
import { parseRepositoryUrl, RepositoryLink, RepositoryProvider } from '../domain/repository';
import { ProjectRegistry } from './ports';

export interface RepositoryLinkInput {
	readonly provider: RepositoryProvider;
	/** Web address of the repository, e.g. `https://github.com/owner/repo`. */
	readonly url: string;
	readonly tokenSecretId: string | null;
	readonly includeClosed: boolean;
}

/** Links the active project to a hosted repository, or removes the link. */
export class RepositoryLinkCommands {
	constructor(private readonly registry: ProjectRegistry) {}

	/** The active project's linked repository, if any. */
	current(): RepositoryLink | null {
		return this.activeSettings().repository;
	}

	/**
	 * Links the repository. Changing the repository or which issues are imported starts the next pull
	 * from scratch; changing only the token keeps the pull history.
	 * @throws InvalidRepositoryError
	 */
	async link(input: RepositoryLinkInput): Promise<void> {
		const address = parseRepositoryUrl(input.provider, input.url);
		const previous = this.activeSettings().repository;
		const sameSource =
			previous !== null &&
			previous.provider === address.provider &&
			previous.host === address.host &&
			previous.path === address.path &&
			previous.includeClosed === input.includeClosed;
		await this.save({
			...address,
			tokenSecretId: input.tokenSecretId,
			includeClosed: input.includeClosed,
			lastPulledAt: sameSource ? previous.lastPulledAt : null,
		});
	}

	async unlink(): Promise<void> {
		await this.save(null);
	}

	private async save(repository: RepositoryLink | null): Promise<void> {
		await this.registry.saveProject(this.registry.activeProject, { ...this.activeSettings(), repository });
	}

	private activeSettings(): ProjectSettings {
		const settings = this.registry.configuredProjects().get(this.registry.activeProject);
		if (!settings) throw new UnknownProjectError(this.registry.activeProject);
		return settings;
	}
}
