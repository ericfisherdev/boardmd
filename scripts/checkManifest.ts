import { existsSync, readFileSync } from 'node:fs';
import { findManifestProblems } from './manifestProblems';

const REQUIRED_FILES = ['README.md', 'LICENSE', 'manifest.json', 'versions.json'];

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const isTagBuild = process.env['GITHUB_REF_TYPE'] === 'tag';
const problems = findManifestProblems({
	manifest: readJson('manifest.json'),
	packageJson: readJson('package.json'),
	versions: readJson('versions.json'),
	tag: isTagBuild ? (process.env['GITHUB_REF_NAME'] ?? null) : null,
	missingFiles: REQUIRED_FILES.filter((file) => !existsSync(file)),
});

if (problems.length === 0) {
	process.stdout.write('Manifest, package and versions files are consistent.\n');
} else {
	problems.forEach((problem) => process.stderr.write(`✖ ${problem}\n`));
	process.exitCode = 1;
}
