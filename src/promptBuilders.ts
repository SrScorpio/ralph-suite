/**
 * promptBuilders.ts — Constructores de prompts para tareas e init
 *
 * Funciones extraídas de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadAndInjectContext } from './contextInjector';
import { RalphStateManager, safeTaskId } from './stateManager';
import { buildInitPromptText } from './agentsMdBuilders';
import { AlfredIdentity } from './alfredIdentity';
import { buildAlfredPrompt, buildAlfredInitPrompt } from './alfredPrompt';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentProfile {
	engine: string;
	model: string;
	mode: string;
	taskType: string;
}

export interface RalphExecutionContext {
	kind: 'ralph-execution';
	localTaskId: string;
	workspaceRoot: string;
}

function isValidRalphExecutionContext(task: any, context: unknown): context is RalphExecutionContext {
	if (!context || typeof context !== 'object') { return false; }
	const candidate = context as Partial<RalphExecutionContext>;
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
	const canonical = (value: string): string | null => {
		try { return fs.realpathSync.native(value); } catch { return null; }
	};
	const candidateRoot = typeof candidate.workspaceRoot === 'string' ? canonical(candidate.workspaceRoot) : null;
	const isWorkspaceRoot = candidateRoot !== null && workspaceFolders.some(folder => {
		const folderRoot = canonical(folder.uri.fsPath);
		return folderRoot !== null && folderRoot === candidateRoot;
	});
	return candidate.kind === 'ralph-execution'
		&& typeof candidate.localTaskId === 'string'
		&& candidate.localTaskId.trim().length > 0
		&& candidate.localTaskId === task?.id
		&& typeof candidate.workspaceRoot === 'string'
		&& candidate.workspaceRoot.trim().length > 0
		&& isWorkspaceRoot;
}

// ── Profile resolution ───────────────────────────────────────────────────────

const ALLOWED_ENGINES = new Set(['copilot', 'codex', 'claude', 'opencode']);
const ALLOWED_MODES = new Set(['execute', 'review']);

export function inferTaskType(task: any): string {
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

function sanitizeModel(raw: unknown): string {
	if (typeof raw !== 'string') { return ''; }
	return raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function allowlistedEngine(raw: unknown, fallback: unknown): string {
	if (typeof raw === 'string' && ALLOWED_ENGINES.has(raw.trim())) { return raw.trim(); }
	if (typeof fallback === 'string' && ALLOWED_ENGINES.has(fallback.trim())) { return fallback.trim(); }
	return 'copilot';
}

function allowlistedMode(raw: unknown, taskType: string): string {
	if (typeof raw === 'string' && ALLOWED_MODES.has(raw)) { return raw; }
	return taskType === 'review' ? 'review' : 'execute';
}

export function resolveAgentProfile(task: any, cfg: vscode.WorkspaceConfiguration): AgentProfile {
	const taskType = inferTaskType(task);
	const profiles = cfg.get<Record<string, Partial<AgentProfile>>>('modelProfiles', {}) ?? {};
	const selected = profiles[taskType] ?? profiles.default ?? {};
	return {
		engine: allowlistedEngine(selected.engine, cfg.get<string>('engine', 'copilot')),
		model: sanitizeModel(selected.model),
		mode: allowlistedMode(selected.mode, taskType),
		taskType,
	};
}

// ── Memory loader ────────────────────────────────────────────────────────────

function loadMemory(root: string, configuredPath: string = '.agent/memories.md'): string | null {
	const p = RalphStateManager.memoriesPath(root, configuredPath);
	if (!fs.existsSync(p)) { return null; }
	return fs.readFileSync(p, 'utf-8').trim() || null;
}

// ── Task prompt ──────────────────────────────────────────────────────────────

/**
 * Señales de completado: protocolo de Ralph (no identidad), por eso se
 * CONSERVAN en modo Alfred (ADR-018 §4).
 */
function completionSignalsBlock(ralphContext: RalphExecutionContext | null, taskId: string): string[] {
	if (!ralphContext) { return []; }
	const ralphDir = path.join(ralphContext.workspaceRoot, '.ralph').replace(/\\/g, '/');
	const safeId = safeTaskId(taskId);
	return [
		'━━━ COMPLETION SIGNALS (Ralph execution only; both required after gates) ━━━',
		`Use the local backlog ID exactly as provided: ${taskId}; never infer or renumber it.`,
		`1. Write (overwrite) the single word \`completed\` to: ${ralphDir}/task-${safeId}-status`,
		`2. Write \`NOTA: <one line summary>\` to: ${ralphDir}/task-${safeId}-note`,
	];
}

/**
 * Prompt en modo Alfred: identidad autoritativa, sin la voz de Ralph y con los
 * datos de la tarea delimitados. La memoria y las señales de completado se
 * conservan (runtime de Ralph, ADR-018 §4).
 */
export function buildPromptInAlfredMode(identity: AlfredIdentity, task: any, context: unknown): string {
	const ralphContext = isValidRalphExecutionContext(task, context) ? context : null;
	const workspaceRoot = ralphContext?.workspaceRoot;
	const memPath = vscode.workspace.getConfiguration('ralph-suite').get<string>('memoriesPath', '.agent/memories.md');
	const memory = workspaceRoot
		? (loadAndInjectContext(workspaceRoot, task.description || '', task.dependencies || [], task.labels || [], task.epic, memPath)?.injected
			?? loadMemory(workspaceRoot, memPath))
		: null;
	const base = buildAlfredPrompt(identity, {
		id: task.id,
		title: task.title,
		description: task.description,
		epic: task.epic,
		priority: task.priority,
		acceptanceCriteria: task.acceptanceCriteria || [],
		labels: task.labels || [],
		dependencies: task.dependencies || [],
		memory,
	});
	return [base, '', ...completionSignalsBlock(ralphContext, task.id)].filter(Boolean).join('\n');
}

/**
 * Selector único de prompt de tarea: con identidad → modo Alfred; sin identidad
 * → ruta de hoy (idéntica byte a byte).
 */
export function selectTaskPrompt(task: any, prd: any, context: unknown, identity?: AlfredIdentity | null): string {
	return identity ? buildPromptInAlfredMode(identity, task, context) : buildPrompt(task, prd, context);
}

export function buildPrompt(task: any, prd: any, context: unknown): string {
	const ralphContext = isValidRalphExecutionContext(task, context) ? context : null;
	const workspaceRoot = ralphContext?.workspaceRoot;
	// ISSUE-002: Intelligent context injection (ADR-002)
	const cfg    = vscode.workspace.getConfiguration('ralph-suite');
	const memPath = cfg.get<string>('memoriesPath', '.agent/memories.md');
	const injection = workspaceRoot ? loadAndInjectContext(
		workspaceRoot,
		task.description || '',
		task.dependencies || [],
		task.labels || [],
		task.epic,
		memPath
	) : null;
	const memory = workspaceRoot
		? injection ? injection.injected : loadMemory(workspaceRoot, memPath)
		: null;
	const guardrails: string[] = cfg.get('guardrails', []);
	const boundaries: string[] = cfg.get('boundaries', []);
	const profile = resolveAgentProfile(task, cfg);
	const completionSignals = ralphContext ? (() => {
		const ralphDir = path.join(ralphContext.workspaceRoot, '.ralph').replace(/\\/g, '/');
		const safeId = safeTaskId(task.id);
		const statusFile = `${ralphDir}/task-${safeId}-status`;
		const noteFile = `${ralphDir}/task-${safeId}-note`;
		return [
			'━━━ COMPLETION SIGNALS (Ralph execution only; both required after gates) ━━━',
			'Completion signals are permitted only for an explicit Ralph context, local task ID, and workspace root.',
			`Use the local backlog ID exactly as provided: ${task.id}; never infer a GitHub issue number or renumber or migrate the ID.`,
			'Write these signals only after the full task scope, verification commands, and quality gates are complete.',
			'Never write completion signals during rejection, blocking, review, or partial handoff.',
			`1. Write (overwrite, not append) the single word \`completed\` to: ${statusFile}`,
			'   The file must contain ONLY the word "completed" — nothing else, no extra lines.',
			`2. Write \`NOTA: <one line summary>\` to: ${noteFile}`,
			'   Example: NOTA: Created plugin skeleton with admin menu and REST endpoint stubs',
			'   Stable memory promotion is explicit: use DECISION:, MEMORIA:, BUG:, or CONVENCION: only for reusable project knowledge.',
			'Do NOT append — overwrite.',
		];
	})() : [];

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
		...completionSignals,
	].filter(Boolean).join('\n');
}

// ── Init prompt ──────────────────────────────────────────────────────────────

export function buildInitPrompt(goal: string, workspaceRoot: string, alfredIdentity?: AlfredIdentity | null): string {
	if (alfredIdentity) {
		return buildAlfredInitPrompt(alfredIdentity, {
			goal,
			workspaceRoot,
			agentsMdOwner: alfredIdentity.agentsMdOwner,
		});
	}
	const cfg         = vscode.workspace.getConfiguration('ralph-suite');
	const guardrails  = cfg.get<string[]>('guardrails', []) ?? [];
	const checkpoints = cfg.get<string[]>('agentCheckpoints', []) ?? [];
	return buildInitPromptText(goal, workspaceRoot, guardrails, checkpoints);
}
