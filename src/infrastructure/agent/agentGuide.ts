import { inverseLinkKind, IssueLinkKind, IssuePriority, IssueType } from '../../domain/issue';
import { SprintState } from '../../domain/sprint';
import { Workflow } from '../../domain/workflow';
import { BoardLocations } from '../boardLocations';
import { ISSUE_FIELD } from '../frontmatter/issueFrontmatter';
import { SPRINT_FIELD } from '../frontmatter/sprintFrontmatter';

export interface AgentGuideInput {
	readonly workflow: Workflow;
	readonly keyPrefix: string;
	readonly locations: BoardLocations;
}

const list = (values: readonly string[]) => values.map((value) => `\`${value}\``).join(', ');

/** Markdown guide that tells an AI agent how the board is stored and how to query or edit it. */
export function renderAgentGuide({ workflow, keyPrefix, locations }: AgentGuideInput): string {
	const statusRows = workflow.statuses.map((s) => `| \`${s.id}\` | ${s.name} | \`${s.category}\` |`).join('\n');
	const linkKinds = list(Object.values(IssueLinkKind));
	return `# Obsidiboard data guide

> [!info] Generated file
> Written by the Obsidiboard plugin whenever its settings change. Do not edit; edit the issue and sprint notes instead.

Obsidiboard is a Jira-style board. This guide covers one project, **${locations.projectName}**; each project is a folder under \`${locations.projectsFolder}\` with its own issues, sprints, workflow and key prefix, and projects never link to each other. Every issue and every sprint is a markdown note whose YAML frontmatter holds its fields.

## Where things are

| Path | Contents |
| --- | --- |
| \`${locations.issuesFolder}/<KEY>.md\` | One note per issue. The file name is the issue key (\`${keyPrefix}-<number>\`). The note body is the description. |
| \`${locations.sprintsFolder}/<Sprint name>.md\` | One note per sprint. The file name is the sprint name. |
| \`${locations.agentIndexPath}\` | Generated JSON snapshot of the whole board with every relationship resolved in both directions. Fastest way to answer questions; refreshed while Obsidian is open, so the notes win if they disagree. |

## Workflow (board columns, in order)

| status id | name | category |
| --- | --- | --- |
${statusRows}

The category, not the name, decides meaning: an issue is complete when its status is in the \`done\` category.

## Issue frontmatter

| Field | Meaning |
| --- | --- |
| \`${ISSUE_FIELD.summary}\` | One-line title. |
| \`${ISSUE_FIELD.type}\` | One of ${list(Object.values(IssueType))}. |
| \`${ISSUE_FIELD.status}\` | A status id from the workflow table. |
| \`${ISSUE_FIELD.priority}\` | One of ${list(Object.values(IssuePriority))}. |
| \`${ISSUE_FIELD.points}\` | Story points (number), optional. |
| \`${ISSUE_FIELD.sprint}\` | Wikilink to the sprint note, including the sprints folder, e.g. \`"[[${locations.sprintsFolder}/Sprint 3|Sprint 3]]"\`. Absent means the issue is in the backlog. |
| \`${ISSUE_FIELD.rank}\` | Ordering number; lower comes first in the backlog, sprints and board columns. |
| \`${ISSUE_FIELD.assignee}\` | Free text, optional. |
| \`${ISSUE_FIELD.parent}\` | Wikilink to the parent issue (usually an epic), e.g. \`"[[${keyPrefix}-1]]"\`. Children are not stored; find them by searching for the parent link. |
| ${linkKinds} | Lists of wikilinks to other issues. The plugin writes both directions (\`blocks\` on one note, \`blocked_by\` on the other) but treats a link written on either side as existing on both. |
| \`${ISSUE_FIELD.source}\` | Web address of the GitHub or GitLab issue this one was pulled from. Absent for issues created on the board. The repository owns such an issue's title, assignee and open/closed state, so changes to those are overwritten by the next pull. |
| \`${ISSUE_FIELD.created}\` / \`${ISSUE_FIELD.resolved}\` | Local dates (YYYY-MM-DD) the issue was created and last moved into a \`done\` status. |

## Sprint frontmatter

| Field | Meaning |
| --- | --- |
| \`${SPRINT_FIELD.state}\` | One of ${list(Object.values(SprintState))}. At most one sprint is \`${SprintState.Active}\`. |
| \`${SPRINT_FIELD.sequence}\` | Creation order. |
| \`${SPRINT_FIELD.startDate}\` / \`${SPRINT_FIELD.endDate}\` | Local dates, set when the sprint starts. |
| \`${SPRINT_FIELD.goal}\` | Sprint goal, optional. |
| \`${SPRINT_FIELD.committedPoints}\` | Points planned into the sprint when it started. |
| \`${SPRINT_FIELD.completedIssues}\` / \`${SPRINT_FIELD.carriedOverIssues}\` / \`${SPRINT_FIELD.completedPoints}\` | Written when the sprint is completed: what was finished and what moved on. Done issues keep their \`${ISSUE_FIELD.sprint}\` link; unfinished ones are re-planned elsewhere. |

## Common questions

- Issues in a sprint: \`jq '.sprints[] | select(.name == "Sprint 3") | .issues' ${locations.agentIndexPath}\`, or search issue notes for \`${ISSUE_FIELD.sprint}\` values containing \`Sprint 3|Sprint 3\` (sprint links include the sprints folder, e.g. \`"[[${locations.sprintsFolder}/Sprint 3|Sprint 3]]"\`, because every project has sprints with the same names).
- What a closed sprint completed: \`jq '.sprints[] | select(.name == "Sprint 2") | {completed_issues, carried_over_issues}' ${locations.agentIndexPath}\`.
- Dependencies of an issue: \`jq '.issues[] | select(.key == "${keyPrefix}-4") | {blocked_by, open_blockers, blocks, relates_to, parent, children}' ${locations.agentIndexPath}\`.
- Backlog in priority order: \`jq '.backlog' ${locations.agentIndexPath}\`.

## Editing by hand

- New issue: create \`${locations.issuesFolder}/${keyPrefix}-<next number>.md\` using one more than the highest existing number, with at least \`${ISSUE_FIELD.summary}\`, \`${ISSUE_FIELD.type}\`, \`${ISSUE_FIELD.status}\` and \`${ISSUE_FIELD.rank}\`.
- Sprint links in issue notes name the sprints folder: \`"[[${locations.sprintsFolder}/<Sprint name>|<Sprint name>]]"\`. Issue links use the bare key.
- Quote wikilinks in YAML (\`"[[${keyPrefix}-2]]"\`), and write link lists as YAML lists.
- When adding a link, also add the inverse on the other note: ${linkPairs()}.
`;
}

function linkPairs(): string {
	return Object.values(IssueLinkKind)
		.map((kind) => `\`${kind}\` ↔ \`${inverseLinkKind(kind)}\``)
		.join(', ');
}
