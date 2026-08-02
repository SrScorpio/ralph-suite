/**
 * contextRefresh.ts — Constructor del prompt de Context Refresh mid-task (ISSUE-001)
 *
 * Extraído de kanbanPanel.ts durante la modularización (ADR-014).
 */

import * as path from 'path';
import { Issue, Prd } from '../prdManager';
import { RalphStateManager, safeTaskId } from '../stateManager';
import { loadAndInjectContext } from '../contextInjector';

export function buildContextRefreshPrompt(
	workspaceRoot: string,
	task: Issue,
	prd: Prd,
	configuredMemoriesPath: string = '.agent/memories.md'
): string {
	// Use ISSUE-002 intelligent context injection (excludes Task History)
	const injection = loadAndInjectContext(
		workspaceRoot,
		task.description || '',
		task.dependencies || [],
		task.labels || [],
		task.epic,
		configuredMemoriesPath
	);
	const memory = injection ? injection.injected : '';

	// Get current task log for summarized progress
	const log = RalphStateManager.getLog(workspaceRoot, task.id);
	const logSummary: string[] = [];
	if (log) {
		if (log.startedAt) { logSummary.push(`- Started at: ${log.startedAt}`); }
		if (log.durationMin !== undefined) { logSummary.push(`- Duration so far: ${log.durationMin} min`); }
		if (log.note) { logSummary.push(`- Last note: ${log.note}`); }
		if (log.summary) { logSummary.push(`- Summary: ${log.summary}`); }
	}

	// Get overall project progress
	const statuses = RalphStateManager.getAllStatuses(workspaceRoot);
	const done = prd.issues.filter(i => (statuses[i.id] ?? 'todo') === 'completed').length;
	const total = prd.issues.length;

	const ralphDir = path.join(workspaceRoot, '.ralph').replace(/\\/g, '/');
	const safeId = safeTaskId(task.id);
	const statusFile = `${ralphDir}/task-${safeId}-status`;
	const noteFile = `${ralphDir}/task-${safeId}-note`;

	return [
		'## ⚡ Context Refresh — Mid-Task Recovery',
		'',
		'The agent may have lost context during a long conversation. Here is the full context to continue.',
		'',
		memory ? `## Project Memory\n${memory}\n` : '',
		`## Current Task: ${task.id} — ${task.title}`,
		`**Epic:** ${task.epic || 'General'}`,
		`**Priority:** ${task.priority}`,
		`**Description:** ${task.description}`,
		'',
		'**Acceptance Criteria:**',
		...(task.acceptanceCriteria || []).map((ac: string, i: number) => `  ${i + 1}. ${ac}`),
		task.dependencies?.length ? `\n**Depends on:** ${task.dependencies.join(', ')}` : '',
		'',
		`## Task Progress`,
		`**Status:** In Progress`,
		`**Project progress:** ${done}/${total} tasks completed`,
		logSummary.length ? logSummary.join('\n') : '- No progress log yet',
		'',
		'---',
		'Continue working on this task. Pick up where you left off.',
		'⚠️ Do NOT modify prd.json.',
		'',
		'━━━ COMPLETION SIGNALS (both required) ━━━',
		`1. Write (overwrite, not append) the single word \`completed\` to: ${statusFile}`,
		'   The file must contain ONLY the word "completed" — nothing else, no extra lines.',
		`2. Write \`NOTA: <one line summary>\` to: ${noteFile}`,
		'   Stable memory promotion is explicit: use DECISION:, MEMORIA:, BUG:, or CONVENCION: only for reusable project knowledge.',
		'Do NOT skip either step. Do NOT append — overwrite.',
	].filter(Boolean).join('\n');
}
