/**
 * promptBuilders.ts — Constructores de prompts para tareas e init
 *
 * Funciones extraídas de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadAndInjectContext } from './contextInjector';
import { safeTaskId } from './stateManager';
import { buildInitPromptText } from './agentsMdBuilders';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentProfile {
	engine: string;
	model: string;
	mode: string;
	taskType: string;
}

// ── Profile resolution ───────────────────────────────────────────────────────

function inferTaskType(task: any): string {
	const text = [
		task.title ?? '',
		task.description ?? '',
		task.epic ?? '',
		...(Array.isArray(task.labels) ? task.labels : []),
	].join(' ').toLowerCase();
	if (/security|sanitize|xss|csp|auth|token|secret|cors/.test(text)) { return 'security'; }
	if (/review|audit|revis/.test(text)) { return 'review'; }
	if (/bug|fix|error|fail|crash|regression/.test(text)) { return 'bugfix'; }
	if (/test|spec|coverage|verify|verif/.test(text)) { return 'test'; }
	if (/doc|readme|manual/.test(text)) { return 'docs'; }
	if (/refactor|architecture|arquitectura/.test(text)) { return 'refactor'; }
	return 'default';
}

function resolveAgentProfile(task: any, cfg: vscode.WorkspaceConfiguration): AgentProfile {
	const taskType = inferTaskType(task);
	const profiles = cfg.get<Record<string, Partial<AgentProfile>>>('modelProfiles', {});
	const selected = profiles[taskType] ?? profiles.default ?? {};
	return {
		engine: selected.engine ?? cfg.get<string>('engine', 'copilot'),
		model: selected.model ?? '',
		mode: selected.mode ?? 'execute',
		taskType,
	};
}

// ── Memory loader ────────────────────────────────────────────────────────────

function loadMemory(root: string, configuredPath: string = '.agent/memories.md'): string | null {
	const p = path.isAbsolute(configuredPath) ? configuredPath : path.join(root, configuredPath);
	if (!fs.existsSync(p)) { return null; }
	return fs.readFileSync(p, 'utf-8').trim() || null;
}

// ── Task prompt ──────────────────────────────────────────────────────────────

export function buildPrompt(task: any, prd: any, workspaceRoot: string): string {
	// ISSUE-002: Intelligent context injection (ADR-002)
	const cfg    = vscode.workspace.getConfiguration('ralph-suite');
	const memPath = cfg.get<string>('memoriesPath', '.agent/memories.md');
	const injection = loadAndInjectContext(
		workspaceRoot,
		task.description || '',
		task.dependencies || [],
		task.labels || [],
		task.epic,
		memPath
	);
	const memory = injection ? injection.injected : loadMemory(workspaceRoot, memPath);
	const guardrails: string[] = cfg.get('guardrails', []);
	const boundaries: string[] = cfg.get('boundaries', []);
	const profile = resolveAgentProfile(task, cfg);
	const ralphDir   = path.join(workspaceRoot, '.ralph').replace(/\\/g, '/');
	const safeId = safeTaskId(task.id);
	const statusFile = `${ralphDir}/task-${safeId}-status`;
	const noteFile   = `${ralphDir}/task-${safeId}-note`;

	return [
		`## Agent Profile`,
		`**Engine:** ${profile.engine}`,
		profile.model ? `**Recommended model:** ${profile.model}` : '**Recommended model:** provider default',
		`**Mode:** ${profile.mode}`,
		`**Task type:** ${profile.taskType}`,
		'Note: if the current chat provider cannot be forced to this model, use this as an explicit manual selection recommendation.',
		'',
		memory ? `## Project Memory\n${memory}\n` : '',
		`## Task: ${task.id} — ${task.title}`,
		`**Epic:** ${task.epic || 'General'}`,
		`**Priority:** ${task.priority}`,
		`**Description:** ${task.description}`,
		'',
		'**Acceptance Criteria:**',
		...(task.acceptanceCriteria || []).map((ac: string, i: number) => `  ${i + 1}. ${ac}`),
		task.dependencies?.length ? `\n**Depends on:** ${task.dependencies.join(', ')}` : '',
		guardrails.length ? `\n**Rules:**\n${guardrails.map((g: string) => `- ${g}`).join('\n')}` : '',
		boundaries.length ? `\n**Never touch:**\n${boundaries.map((b: string) => `- ${b}`).join('\n')}` : '',
		'',
		'---',
		'Execute directly. No questions unless a checkpoint is hit.',
		'Before editing, inspect current files and preserve unrelated user changes.',
		'After editing, run the narrowest relevant verification command available.',
		'⚠️ Do NOT modify prd.json.',
		'',
		'━━━ COMPLETION SIGNALS (both required) ━━━',
		`1. Write (overwrite, not append) the single word \`completed\` to: ${statusFile}`,
		`   The file must contain ONLY the word "completed" — nothing else, no extra lines.`,
		`2. Write \`NOTA: <one line summary>\` to: ${noteFile}`,
		`   Example: NOTA: Created plugin skeleton with admin menu and REST endpoint stubs`,
		`   Stable memory promotion is explicit: use DECISION:, MEMORIA:, BUG:, or CONVENCION: only for reusable project knowledge.`,
		'Do NOT skip either step. Do NOT append — overwrite.',
	].filter(Boolean).join('\n');
}

// ── Init prompt ──────────────────────────────────────────────────────────────

export function buildInitPrompt(goal: string, workspaceRoot: string): string {
	const cfg         = vscode.workspace.getConfiguration('ralph-suite');
	const guardrails  = cfg.get<string[]>('guardrails', []) ?? [];
	const checkpoints = cfg.get<string[]>('agentCheckpoints', []) ?? [];
	return buildInitPromptText(goal, workspaceRoot, guardrails, checkpoints);
}
