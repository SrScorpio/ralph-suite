/**
 * gitHubSync.ts — Constructores de prompts para push/sync de GitHub Issues
 *
 * Extraído de kanbanPanel.ts durante la modularización (ADR-014).
 */

import { Issue, Prd } from '../prdManager';

export function buildPushPrompt(prd: Prd, issues: Issue[]): string {
	const issueList = issues.map(i => {
		const criteria = (i.acceptanceCriteria ?? [])
			.map(ac => `  - [ ] ${ac}`).join('\n');
		const deps = i.dependencies?.length
			? `\n**Depends on:** ${i.dependencies.join(', ')}` : '';
		return [
			`### ${i.id}: ${i.title}`,
			`**Priority:** ${i.priority}${i.epic ? ` | **Epic:** ${i.epic}` : ''}`,
			`**Description:** ${i.description}`,
			criteria ? `**Acceptance Criteria:**\n${criteria}` : '',
			deps,
			`**Labels:** priority:${i.priority}${i.epic ? `, epic:${i.epic}` : ''}`,
			`> Ralph Suite ID: \`${i.id}\``,
		].filter(Boolean).join('\n');
	}).join('\n\n---\n\n');

	return [
		`Using the GitHub MCP tool, create the following GitHub Issues for project **${prd.project}**.`,
		``,
		`For each issue:`,
		`- Use the title exactly as shown`,
		`- Copy the full description and acceptance criteria into the body (format criteria as a checklist)`,
		`- Apply the labels shown (create first if missing: priority:P0=#f85149, priority:P1=#e3b341, priority:P2=#58a6ff, priority:P3=#6e7681, epic labels=#8957e5)`,
		`- Keep the line "Ralph Suite ID: \`<id>\`" at the bottom of each body for future sync`,
		`- Do NOT modify prd.json`,
		``,
		`Issues to create (${issues.length} total):`,
		``,
		issueList,
		``,
		`After creating all issues, reply with a summary: GitHub number, title, and URL for each.`,
	].join('\n');
}

export function buildSyncPrompt(prd: Prd, workspaceRoot: string): string {
	const ralphDir = workspaceRoot.replace(/\\/g, '/') + '/.ralph';
	const ids = prd.issues.map(i => `\`${i.id}\``).join(', ');

	return [
		`Using the GitHub MCP tool, sync the status of GitHub Issues back to this local project.`,
		``,
		`Project: **${prd.project}**`,
		`Ralph status directory: \`${ralphDir}\``,
		`Tracked IDs: ${ids}`,
		``,
		`Steps:`,
		`1. List all GitHub Issues in this repo (open and closed)`,
		`2. For each issue containing "Ralph Suite ID:" in the body, extract the Ralph ID`,
		`3. Write status files based on GitHub Issue state:`,
		`   - **Closed** → write the text \`completed\` to \`${ralphDir}/task-<RALPH_ID>-status\``,
		`   - **Open + assigned to someone** → write \`inprogress\` to \`${ralphDir}/task-<RALPH_ID>-status\``,
		`   - **Open + unassigned** → skip, do not touch the local file`,
		`4. Use the filesystem write tool to create each status file`,
		``,
		`After syncing, confirm which files were written and their status.`,
		`Do NOT delete existing status files not found on GitHub.`,
	].join('\n');
}
