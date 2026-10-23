/** What the release checks read from the repository. */
export interface ManifestCheckInput {
	readonly manifest: Readonly<Record<string, unknown>>;
	readonly packageJson: Readonly<Record<string, unknown>>;
	/** `versions.json`: plugin version → minimum Obsidian version. */
	readonly versions: Readonly<Record<string, unknown>>;
	/** The git tag being released, when checking a tag build. */
	readonly tag: string | null;
	/** Files that must exist in the repository root. */
	readonly missingFiles: readonly string[];
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const MAX_DESCRIPTION_LENGTH = 250;
const PLUGIN_SELF_REFERENCE = /^this (is )?(an? )?(obsidian )?plugin/i;

/** A JSON value as it should read in a message; a missing value reads as `undefined`. */
function describe(value: unknown): string {
	return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined');
}

/**
 * The community directory's rules for the manifest description: at most 250 characters, ending
 * with a period, and opening with what the plugin does rather than "This is a plugin…".
 */
function findDescriptionProblems(description: unknown): string[] {
	if (typeof description !== 'string' || description.trim() === '') return ['manifest.json needs a description.'];
	const problems: string[] = [];
	if (description.length > MAX_DESCRIPTION_LENGTH) {
		problems.push(`manifest.json description is ${description.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}.`);
	}
	if (!description.endsWith('.')) problems.push('manifest.json description must end with a period.');
	if (PLUGIN_SELF_REFERENCE.test(description)) {
		problems.push('manifest.json description must start with what the plugin does, not "This is a plugin".');
	}
	return problems;
}

/**
 * Everything that would make the plugin's release inconsistent or unacceptable to the community
 * directory: mismatched versions, a tag that differs from the manifest version, a bad plugin id or
 * description, missing README or LICENSE. Empty when the repository is ready.
 */
export function findManifestProblems({ manifest, packageJson, versions, tag, missingFiles }: ManifestCheckInput): string[] {
	const problems: string[] = [];
	const version = manifest['version'];
	const minAppVersion = manifest['minAppVersion'];
	const id = manifest['id'];

	if (typeof version !== 'string' || !SEMVER.test(version)) problems.push(`manifest.json version "${describe(version)}" must look like 1.2.3.`);
	if (typeof minAppVersion !== 'string' || !SEMVER.test(minAppVersion)) problems.push(`manifest.json minAppVersion "${describe(minAppVersion)}" must look like 1.2.3.`);
	if (typeof id !== 'string' || id === '') problems.push('manifest.json needs an id.');
	else if (id.toLowerCase().includes('obsidian')) problems.push(`manifest.json id "${id}" must not contain "obsidian".`);
	problems.push(...findDescriptionProblems(manifest['description']));

	if (packageJson['version'] !== version) {
		problems.push(`package.json version "${describe(packageJson['version'])}" differs from manifest.json version "${describe(version)}".`);
	}

	for (const key of Object.keys(versions)) {
		if (!SEMVER.test(key)) problems.push(`versions.json key "${key}" must look like 1.2.3.`);
	}
	if (typeof version === 'string') {
		const required = versions[version];
		if (required === undefined) problems.push(`versions.json has no entry for the current version ${version}.`);
		else if (required !== minAppVersion) {
			problems.push(`versions.json says ${version} needs Obsidian ${describe(required)}, but manifest.json minAppVersion is "${describe(minAppVersion)}".`);
		}
	}

	if (tag !== null && tag !== version) {
		problems.push(`The release tag "${tag}" must exactly match the manifest version "${describe(version)}" (no "v" prefix).`);
	}
	for (const file of missingFiles) problems.push(`${file} is missing from the repository root.`);
	return problems;
}
