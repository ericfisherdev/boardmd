import { SecretStorage } from 'obsidian';
import { TokenStore } from '../application/ports';

/** Access tokens kept in Obsidian's secret storage (the operating system's keychain). */
export class SecretStorageTokens implements TokenStore {
	constructor(private readonly secrets: SecretStorage) {}

	tokenFor(secretId: string): string | null {
		return this.secrets.getSecret(secretId);
	}
}
