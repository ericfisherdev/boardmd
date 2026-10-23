import { describe, expect, it } from 'vitest';
import { findManifestProblems, ManifestCheckInput } from '../scripts/manifestProblems';

const consistent: ManifestCheckInput = {
	manifest: { id: 'boardmd', version: '1.2.3', minAppVersion: '1.11.4', description: 'Plan work with sprints and boards.' },
	packageJson: { version: '1.2.3' },
	versions: { '1.2.3': '1.11.4', '1.0.0': '1.7.2' },
	tag: null,
	missingFiles: [],
};

const with_ = (overrides: Partial<ManifestCheckInput>): ManifestCheckInput => ({ ...consistent, ...overrides });

describe('findManifestProblems', () => {
	it('finds nothing wrong with a consistent repository, with or without a matching tag', () => {
		expect(findManifestProblems(consistent)).toEqual([]);
		expect(findManifestProblems(with_({ tag: '1.2.3' }))).toEqual([]);
	});

	it('rejects versions that are not x.y.z', () => {
		const problems = findManifestProblems(with_({ manifest: { ...consistent.manifest, version: 'v1.2', minAppVersion: '1.11' } }));
		expect(problems.join('\n')).toMatch(/version "v1.2"/);
		expect(problems.join('\n')).toMatch(/minAppVersion "1.11"/);
	});

	it('rejects a package.json version that differs from the manifest', () => {
		expect(findManifestProblems(with_({ packageJson: { version: '1.2.4' } }))).toEqual([
			'package.json version "1.2.4" differs from manifest.json version "1.2.3".',
		]);
	});

	it('requires versions.json to list the current version with the manifest minimum, and only x.y.z keys', () => {
		expect(findManifestProblems(with_({ versions: { '1.0.0': '1.7.2' } }))).toEqual(['versions.json has no entry for the current version 1.2.3.']);
		expect(findManifestProblems(with_({ versions: { '1.2.3': '1.7.2' } }))[0]).toMatch(/needs Obsidian 1.7.2, but manifest.json minAppVersion is "1.11.4"/);
		expect(findManifestProblems(with_({ versions: { ...consistent.versions, latest: '1.0.0' } }))).toEqual(['versions.json key "latest" must look like 1.2.3.']);
	});

	it('rejects a plugin id that contains "obsidian", in any letter case, or no id', () => {
		expect(findManifestProblems(with_({ manifest: { ...consistent.manifest, id: 'My-Obsidian-Plugin' } }))[0]).toMatch(/must not contain "obsidian"/);
		expect(findManifestProblems(with_({ manifest: { ...consistent.manifest, id: '' } }))).toEqual(['manifest.json needs an id.']);
	});

	it('requires a description the community directory accepts', () => {
		const describedAs = (description: unknown) => findManifestProblems(with_({ manifest: { ...consistent.manifest, description } }));
		expect(describedAs(undefined)).toEqual(['manifest.json needs a description.']);
		expect(describedAs('   ')).toEqual(['manifest.json needs a description.']);
		expect(describedAs(`${'a'.repeat(250)}.`)).toEqual(['manifest.json description is 251 characters; the limit is 250.']);
		expect(describedAs('Plan work with sprints')).toEqual(['manifest.json description must end with a period.']);
		expect(describedAs('This is an Obsidian plugin for sprints.')[0]).toMatch(/must start with what the plugin does/);
		expect(describedAs(`${'a'.repeat(249)}.`)).toEqual([]);
	});

	it('requires the release tag to be exactly the manifest version', () => {
		expect(findManifestProblems(with_({ tag: 'v1.2.3' }))).toEqual([
			'The release tag "v1.2.3" must exactly match the manifest version "1.2.3" (no "v" prefix).',
		]);
	});

	it('reports each missing file', () => {
		expect(findManifestProblems(with_({ missingFiles: ['README.md', 'LICENSE'] }))).toEqual([
			'README.md is missing from the repository root.',
			'LICENSE is missing from the repository root.',
		]);
	});
});
