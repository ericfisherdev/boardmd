/** Where the active project's data lives inside the vault. */
export interface BoardLocations {
	/** Folder that holds one subfolder per project. */
	readonly projectsFolder: string;
	/** Name of the active project, which is also the name of its folder. */
	readonly projectName: string;
	readonly boardFolder: string;
	readonly issuesFolder: string;
	readonly sprintsFolder: string;
	readonly agentIndexPath: string;
	readonly agentGuidePath: string;
}

export const ISSUES_SUBFOLDER = 'issues';
export const SPRINTS_SUBFOLDER = 'sprints';
export const AGENT_INDEX_FILE = 'index.json';
export const AGENT_GUIDE_FILE = 'AGENTS.md';

export function locationsFor(projectsFolder: string, projectName: string): BoardLocations {
	const boardFolder = `${projectsFolder}/${projectName}`;
	return {
		projectsFolder,
		projectName,
		boardFolder,
		issuesFolder: `${boardFolder}/${ISSUES_SUBFOLDER}`,
		sprintsFolder: `${boardFolder}/${SPRINTS_SUBFOLDER}`,
		agentIndexPath: `${boardFolder}/${AGENT_INDEX_FILE}`,
		agentGuidePath: `${boardFolder}/${AGENT_GUIDE_FILE}`,
	};
}
