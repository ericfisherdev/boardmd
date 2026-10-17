# Obsidiboard walkthrough

A tour of the plugin in a sandbox vault. Every screenshot was taken from a running Obsidian (1.14.4) with the plugin loaded; the vault has two projects, **Obsidiboard** and **Website**, each with its own sprints, issues and workflow.

Everything Obsidiboard shows is stored as plain notes under a projects folder:

```
Projects/
  Obsidiboard/
    issues/OB-1.md … OB-11.md
    sprints/Sprint 1.md …
    index.json, AGENTS.md      (generated, for AI agents)
  Website/
    issues/WEB-1.md …
    sprints/Sprint 1.md …
```

## 1. Plan in the backlog

![The backlog view](01-backlog.png)

The backlog lists the active sprint, planned sprints and the backlog, in rank order. Each row shows the type, key, summary, a warning when unfinished issues block it, its parent epic, status, assignee, priority and story points. Drag rows to re-rank them or to move them between sprints. **Start sprint** and **Complete sprint** sit in each sprint's header; completing a sprint records what was finished and carries the rest over.

The toolbar has the **project switcher**, a filter box, and buttons to create an issue, pull issues from a linked repository, create a sprint and open the sprint board.

## 2. Work the sprint board

![The sprint board](02-sprint-board.png)

The sprint board shows the active sprint with one column per status in the project's workflow. The header shows the end date, days left and points done. Cards show the same details as backlog rows.

## 3. Create an issue

![The create issue form](03-create-issue-form.png)

**Create issue** opens a form that starts with the work itself (summary, description), then optional details (type, priority, story points, assignee), then planning (sprint and parent). Only the summary is required, and the **Create** button stays greyed out until it has text. The sprint defaults to the active sprint when you open the form from the board.

![The form filled in](04-create-issue-filled.png)

![The new card on the board](05-issue-on-board.png)

After you create it, a notice shows the new key and the card appears in the first column.

## 4. Move cards between columns

![Dragging a card](06-dragging-card.png)

Drag a card to another column or to a different position in a column. A line shows where it will land.

![The card in its new column](07-card-moved.png)

Dropping changes the issue's status and writes it to the note straight away. Moving a card into a Done status also records the date it was resolved.

## 5. Edit an issue

Click a card to open its edit form. Ctrl or Cmd-click opens the issue's note in a new tab instead.

![The edit form](08-edit-issue-form.png)

Type, priority and status are dropdowns, and the parent is chosen from existing issues.

![Links and autosave](09-edit-links-and-autosave.png)

Links to other issues (blocks, is blocked by, relates to, duplicates, is duplicated by) are chosen the same way. Changes save by themselves a moment after you stop typing, and the form says so at the bottom. **Done** saves anything pending and closes it.

![Searching for an issue to link](10-link-picker-suggestions.png)

Each picker suggests existing issues by key or summary as you type.

![A link added and saved](11-link-added-autosaved.png)

Adding a link writes both sides: OB-4 now lists OB-7 under `blocks`, and OB-7 lists OB-4 under `blocked_by`.

![The board after linking](12-board-with-blocked-link.png)

An issue that is blocked by unfinished work gets a red warning icon on its card.

## 6. Several projects

![The Website project's board](13-switch-project-website-board.png)

The dropdown next to the title switches projects. The Website project has its own sprint, issues and a three-column workflow (To Do, In Progress, Done), while Obsidiboard has six columns. Each project also has its own issue key prefix (`OB-`, `WEB-`) and default sprint length.

## 7. Settings

![Project settings](14-settings-projects.png)

The settings tab holds the projects folder, the switch for the generated AI-agent files, and the active project's key prefix and default sprint length.

![Repository link and workflow](15-settings-repository.png)

Each project can be linked to a GitHub or GitLab repository, with the access token kept in Obsidian's secret storage. **Pull issues** imports the repository's issues into the project's `issues` folder, and later pulls keep their title, assignee and open or closed state in step. Descriptions are saved as plain text unless you choose to trust the repository. The same page edits the project's workflow: statuses, their order, and whether each counts as to do, in progress or done.

## 8. It is all plain notes

![An issue note with its properties](16-issue-note-properties.png)

Each issue is a normal note. Its fields are properties, links to other issues are links, and its description is the note body. Because the data is plain text, people and AI agents can read and edit it without the plugin. The plugin also writes `index.json` and `AGENTS.md` to each project folder, describing the board for agents.
