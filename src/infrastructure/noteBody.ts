/**
 * Text that starts with a `---` line would be read as frontmatter, and adding the real frontmatter
 * afterwards would edit it instead of the note's properties. A leading blank line prevents that.
 */
export function keepOutOfFrontmatter(body: string): string {
	return /^\s*---[ \t]*(\r?\n|$)/.test(body) ? `\n${body}` : body;
}
