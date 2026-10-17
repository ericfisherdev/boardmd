import { FileManager, MetadataCache, normalizePath, TFile, TFolder, Vault } from 'obsidian';
import { Frontmatter } from './frontmatter/values';
import { keepOutOfFrontmatter } from './noteBody';
import { IndexingTracker } from './IndexingTracker';

export interface NoteRecord {
	readonly basename: string;
	readonly frontmatter: Frontmatter;
}

/** Folder-scoped access to markdown notes and their frontmatter. */
export class VaultNoteStore {
	constructor(
		private readonly vault: Vault,
		private readonly metadataCache: MetadataCache,
		private readonly fileManager: FileManager,
		private readonly indexing: IndexingTracker,
	) {}

	/** Notes directly inside the folder, read from the metadata cache. */
	list(folder: string): NoteRecord[] {
		const directory = this.vault.getAbstractFileByPath(normalizePath(folder));
		if (!(directory instanceof TFolder)) return [];
		return directory.children
			.filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
			.map((file) => this.toRecord(file));
	}

	read(folder: string, basename: string): NoteRecord | null {
		const file = this.file(folder, basename);
		return file ? this.toRecord(file) : null;
	}

	file(folder: string, basename: string): TFile | null {
		const file = this.vault.getAbstractFileByPath(notePath(folder, basename));
		return file instanceof TFile ? file : null;
	}

	/** Creates the note (and missing parent folders) with the given frontmatter and body. */
	async create(folder: string, basename: string, frontmatter: Frontmatter, body: string): Promise<void> {
		await this.ensureFolder(folder);
		this.indexing.expectIndexing(notePath(folder, basename));
		const file = await this.vault.create(notePath(folder, basename), keepOutOfFrontmatter(body));
		await this.fileManager.processFrontMatter(file, (existing: Frontmatter) => Object.assign(existing, frontmatter));
	}

	/**
	 * Atomically edits the note's frontmatter.
	 * @returns false when the note does not exist.
	 * @throws YAMLParseError when the note's existing frontmatter is malformed.
	 */
	async updateFrontmatter(folder: string, basename: string, mutate: (frontmatter: Frontmatter) => void): Promise<boolean> {
		const file = this.file(folder, basename);
		if (!file) return false;
		this.indexing.expectIndexing(file.path);
		await this.fileManager.processFrontMatter(file, mutate);
		return true;
	}

	/** Creates or overwrites a plain file, skipping the write when the content is unchanged. */
	async writeFile(path: string, content: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFile) {
			if ((await this.vault.cachedRead(existing)) !== content) await this.vault.modify(existing, content);
			return;
		}
		await this.ensureFolder(normalized.split('/').slice(0, -1).join('/'));
		await this.vault.create(normalized, content);
	}

	private toRecord(file: TFile): NoteRecord {
		const frontmatter = this.metadataCache.getFileCache(file)?.frontmatter ?? {};
		return { basename: file.basename, frontmatter };
	}

	folderExists(folder: string): boolean {
		return this.vault.getAbstractFileByPath(normalizePath(folder)) instanceof TFolder;
	}

	/** Creates the folder and any missing parents. */
	async ensureFolder(folder: string): Promise<void> {
		let current = '';
		for (const segment of normalizePath(folder).split('/').filter(Boolean)) {
			current = current === '' ? segment : `${current}/${segment}`;
			if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current);
		}
	}
}

function notePath(folder: string, basename: string): string {
	return normalizePath(`${folder}/${basename}.md`);
}
