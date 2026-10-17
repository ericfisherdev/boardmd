export type ProjectFolderChange =
	| { readonly kind: 'renamed'; readonly from: string; readonly to: string }
	| { readonly kind: 'removed'; readonly name: string };

/**
 * What a rename or deletion in the vault means for the projects, given the projects folder.
 * Only direct subfolders of the projects folder are projects; anything else returns null.
 * @param newPath where the folder went; null when it was deleted.
 */
export function projectFolderChange(projectsFolder: string, oldPath: string, newPath: string | null): ProjectFolderChange | null {
	const from = projectNameAt(projectsFolder, oldPath);
	if (from === null) return null;
	if (newPath === null) return { kind: 'removed', name: from };
	const to = projectNameAt(projectsFolder, newPath);
	return to === null ? { kind: 'removed', name: from } : { kind: 'renamed', from, to };
}

/** The project name when `path` is a direct child of the projects folder. */
function projectNameAt(projectsFolder: string, path: string): string | null {
	const prefix = `${projectsFolder}/`;
	if (!path.startsWith(prefix)) return null;
	const name = path.slice(prefix.length);
	return name === '' || name.includes('/') ? null : name;
}
