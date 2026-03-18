import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { KanbanPanel } from './kanbanPanel';
import { RalphStateManager } from './stateManager';
import { PrdManager } from './prdManager';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Ralph Suite');
	context.subscriptions.push(output);

	// Status bar — click opens quick menu
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = '$(layout-panel) Ralph';
	statusBar.tooltip = 'Ralph Suite — click for quick menu';
	statusBar.command = 'ralph-suite.showMenu';
	statusBar.show();
	context.subscriptions.push(statusBar);

	context.subscriptions.push(

		// ── Quick menu ───────────────────────────────────────────────────────
		vscode.commands.registerCommand('ralph-suite.showMenu', async () => {
			const root = getWorkspaceRoot();
			const prd  = root ? PrdManager.load(root) : null;
			const done  = prd ? prd.issues.filter(i => i.status === 'completed').length : 0;
			const total = prd ? prd.issues.length : 0;
			const pct   = total ? Math.round((done / total) * 100) : 0;

			const items: vscode.QuickPickItem[] = [
				{ label: '$(layout-panel)  Open Board',   description: prd ? `${prd.project} — ${done}/${total} (${pct}%)` : 'No prd.json' },
				{ label: '$(zap)  Auto-run',              description: 'Start autonomous task loop' },
				{ label: '$(debug-stop)  Stop runner',    description: 'Stop the current run' },
				{ label: '$(play)  Run next task',        description: 'Run the next pending task' },
				{ label: '$(add)  Add Issue',             description: 'Add a new issue to prd.json' },
				{ label: '$(file)  Open PRD',             description: 'Open prd.json in editor' },
				{ label: '$(book)  Memories',             description: 'Open .agent/memories.md' },
				{ label: '$(tools)  Setup Project',       description: 'Generate/regenerate AGENTS.md and plans/' },
				{ label: '$(gear)  Settings',             description: 'Configure Ralph Suite' },
			];

			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: 'Ralph Suite — select a command',
				matchOnDescription: true,
			});
			if (!pick) { return; }

			// Actions that need board open first
			const boardActions: Record<string, string> = {
				'$(add)  Add Issue': 'showAddIssue',
				'$(file)  Open PRD': 'openPrd',
				'$(book)  Memories': 'openMemories',
			};
			const boardAction = boardActions[pick.label];
			if (boardAction) {
				vscode.commands.executeCommand('ralph-suite.openKanban');
				setTimeout(() => KanbanPanel.sendMessage(boardAction), 500);
				return;
			}

			const directCmds: Record<string, string> = {
				'$(layout-panel)  Open Board': 'ralph-suite.openKanban',
				'$(zap)  Auto-run':            'ralph-suite.startRunner',
				'$(debug-stop)  Stop runner':  'ralph-suite.stopRunner',
				'$(play)  Run next task':      'ralph-suite.runTask',
				'$(tools)  Setup Project':     'ralph-suite.setupProject',
				'$(gear)  Settings':           'ralph-suite.openSettings',
			};
			if (directCmds[pick.label]) {
				vscode.commands.executeCommand(directCmds[pick.label]);
			}
		}),

		// ── Board ─────────────────────────────────────────────────────────────
		vscode.commands.registerCommand('ralph-suite.openKanban', () => {
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			KanbanPanel.createOrShow(context.extensionUri, root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.startRunner', () => {
			KanbanPanel.sendMessage('startRunner');
		}),

		vscode.commands.registerCommand('ralph-suite.stopRunner', () => {
			KanbanPanel.sendMessage('stopRunner');
		}),

		// ── Project ───────────────────────────────────────────────────────────
		vscode.commands.registerCommand('ralph-suite.setupProject', () => {
			setupProject(output);
		}),

		vscode.commands.registerCommand('ralph-suite.initProject', () => {
			initProject(output);
		}),

		vscode.commands.registerCommand('ralph-suite.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite');
		}),

		// ── Task execution ────────────────────────────────────────────────────
		vscode.commands.registerCommand('ralph-suite.runTask', async (taskId?: string) => {
			const root = getWorkspaceRoot();
			if (!root) { return; }
			const prd = PrdManager.load(root);
			if (!prd) { vscode.window.showErrorMessage('No prd.json found.'); return; }

			const task = taskId
				? prd.issues.find(i => i.id === taskId)
				: PrdManager.nextPending(prd, root);
			if (!task) { vscode.window.showInformationMessage('No pending tasks.'); return; }

			const cfg          = vscode.workspace.getConfiguration('ralph-suite');
			const prompt       = buildPrompt(task, prd, root);
			const freshContext = cfg.get<boolean>('freshContext', true);
			const minWaitMs    = cfg.get<number>('minWaitMs', 15000);
			const timeoutMs    = cfg.get<number>('taskTimeoutMs', 600000);
			const retries      = cfg.get<number>('taskRetries', 1);

			await runTaskWithRetry(task, prompt, root, freshContext, minWaitMs, timeoutMs, retries, output);
		}),

		vscode.commands.registerCommand('ralph-suite.markDone', async (taskId: string) => {
			const root = getWorkspaceRoot();
			if (!root) { return; }
			RalphStateManager.setCompleted(root, taskId);
			KanbanPanel.refresh();
		}),

		vscode.commands.registerCommand('ralph-suite.resetTask', async (taskId: string) => {
			const root = getWorkspaceRoot();
			if (!root) { return; }
			RalphStateManager.reset(root, taskId);
			KanbanPanel.refresh();
		})
	);

	// Watch prd.json for external changes
	const watcher = vscode.workspace.createFileSystemWatcher('**/prd.json');
	watcher.onDidChange(() => KanbanPanel.refresh());
	watcher.onDidCreate(() => KanbanPanel.refresh());
	context.subscriptions.push(watcher);

	output.appendLine('Ralph Suite activated.');
}

export function deactivate() {}

// ── Task execution with timeout + retry ──────────────────────────────────────

async function runTaskWithRetry(
	task: any,
	prompt: string,
	root: string,
	freshContext: boolean,
	minWaitMs: number,
	timeoutMs: number,
	retries: number,
	output: vscode.OutputChannel
): Promise<void> {
	const pollMs = vscode.workspace.getConfiguration('ralph-suite').get<number>('pollIntervalMs', 5000);

	for (let attempt = 1; attempt <= retries + 1; attempt++) {
		if (attempt > 1) {
			output.appendLine(`[Ralph] Retrying ${task.id} (attempt ${attempt}/${retries + 1})...`);
			vscode.window.showInformationMessage(`Ralph: retrying ${task.id} (attempt ${attempt})`);
		}

		try {
			if (freshContext) {
				await vscode.commands.executeCommand('workbench.action.chat.newChat');
				await sleep(400);
			}
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: prompt, isPartialQuery: false
			});
		} catch {
			await vscode.env.clipboard.writeText(prompt);
			vscode.window.showInformationMessage('Prompt copied to clipboard — paste in Chat.');
			return;
		}

		RalphStateManager.setInProgress(root, task.id);
		KanbanPanel.refresh();
		output.appendLine(`[Ralph] Task ${task.id} started${freshContext ? ' (fresh context)' : ''} — waiting min ${Math.round(minWaitMs / 1000)}s`);

		// Wait minimum time before polling
		await sleep(minWaitMs);

		// Poll until completed or timeout
		const startedAt = Date.now();
		let completed   = false;

		while (Date.now() - startedAt < timeoutMs - minWaitMs) {
			const status = RalphStateManager.getStatus(root, task.id);
			if (status === 'completed') {
				completed = true;
				output.appendLine(`[Ralph] ✓ Task ${task.id} completed (${Math.round((Date.now() - startedAt + minWaitMs) / 1000)}s)`);
				break;
			}
			const elapsed = Math.round((Date.now() - startedAt + minWaitMs) / 1000);
			const remaining = Math.round((timeoutMs - (Date.now() - startedAt)) / 1000);
			output.appendLine(`[Ralph] ⏳ ${task.id} still running… ${elapsed}s elapsed, ${remaining}s remaining`);
			await sleep(pollMs);
		}

		if (completed) { return; }

		// Timed out
		output.appendLine(`[Ralph] ⚠ Task ${task.id} timed out after ${Math.round(timeoutMs / 1000)}s`);
		if (attempt <= retries) {
			// Reset status so retry starts clean
			RalphStateManager.reset(root, task.id);
			KanbanPanel.refresh();
		} else {
			// All retries exhausted — mark as failed
			RalphStateManager.setFailed(root, task.id, `Timed out after ${retries + 1} attempt(s)`);
			KanbanPanel.refresh();
			vscode.window.showWarningMessage(
				`Ralph: task ${task.id} timed out after ${retries + 1} attempt(s). Check the output channel for details.`,
				'Open Output'
			).then(action => {
				if (action === 'Open Output') { output.show(); }
			});
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function buildPrompt(task: any, prd: any, workspaceRoot: string): string {
	const memory = loadMemory(workspaceRoot);
	const cfg    = vscode.workspace.getConfiguration('ralph-suite');
	const guardrails: string[] = cfg.get('guardrails', []);
	const boundaries: string[] = cfg.get('boundaries', []);

	const ralphDir   = path.join(workspaceRoot, '.ralph').replace(/\\/g, '/');
	const statusFile = `${ralphDir}/task-${task.id}-status`;
	const noteFile   = `${ralphDir}/task-${task.id}-note`;

	const lines = [
		memory ? `## Project Memory\n${memory}\n` : '',
		`## Task: ${task.id} — ${task.title}`,
		`**Epic:** ${task.epic || 'General'}`,
		`**Priority:** ${task.priority}`,
		`**Description:** ${task.description}`,
		'',
		'**Acceptance Criteria:**',
		...(task.acceptanceCriteria || []).map((ac: string, i: number) => `  ${i + 1}. ${ac}`),
		task.dependencies?.length ? `\n**Depends on:** ${task.dependencies.join(', ')}` : '',
		guardrails.length ? `\n**Rules (follow always):**\n${guardrails.map((g: string) => `- ${g}`).join('\n')}` : '',
		boundaries.length ? `\n**Never touch these paths:**\n${boundaries.map((b: string) => `- ${b}`).join('\n')}` : '',
		'',
		'---',
		'Execute this task directly. Make actual code changes. Do not ask questions.',
		'If something partially fails, keep the passing parts.',
		'',
		'⚠️ Do NOT modify prd.json.',
		'',
		'━━━ COMPLETION SIGNALS (REQUIRED — both) ━━━',
		`1. Write \`completed\` to: ${statusFile}`,
		`2. Write a single line to: ${noteFile}`,
		`   Format exactly: NOTA: <one line summary of what was done>`,
		`   Example: NOTA: Created runpod/requirements.txt with pinned ultralytics==8.2.0`,
		'Do NOT skip either step.',
	].filter(Boolean);
	return lines.join('\n');
}

function loadMemory(root: string): string | null {
	const p = path.join(root, '.agent', 'memories.md');
	if (!fs.existsSync(p)) { return null; }
	return fs.readFileSync(p, 'utf-8').trim() || null;
}

async function initProject(output: vscode.OutputChannel) {
	const root = getWorkspaceRoot();
	if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }

	const prdPath  = path.join(root, 'prd.json');
	const ralphDir = path.join(root, '.ralph');

	if (fs.existsSync(prdPath)) {
		const action = await vscode.window.showInformationMessage(
			'prd.json already exists.', 'Open Kanban', 'Cancel'
		);
		if (action === 'Open Kanban') { vscode.commands.executeCommand('ralph-suite.openKanban'); }
		return;
	}

	if (fs.existsSync(ralphDir)) {
		const statusFiles = fs.readdirSync(ralphDir).filter(f => f.endsWith('-status'));
		if (statusFiles.length > 0) {
			const action = await vscode.window.showWarningMessage(
				`Found ${statusFiles.length} task status file(s) in .ralph/ from a previous project.`,
				'Clear .ralph/ and continue', 'Continue anyway', 'Cancel'
			);
			if (!action || action === 'Cancel') { return; }
			if (action === 'Clear .ralph/ and continue') {
				for (const f of fs.readdirSync(ralphDir)) {
					try { fs.unlinkSync(path.join(ralphDir, f)); } catch { /**/ }
				}
				output.appendLine('[Ralph] Cleared .ralph/ before new project init');
			}
		}
	}

	const goal = await vscode.window.showInputBox({
		title: 'Ralph Suite — Init Project',
		prompt: 'Describe your project goal',
		placeHolder: 'e.g. WordPress plugin for image geolocation',
		ignoreFocusOut: true
	});
	if (!goal) { return; }

	const agentDir = path.join(root, '.agent');
	if (!fs.existsSync(agentDir)) { fs.mkdirSync(agentDir, { recursive: true }); }
	const memoriesPath = path.join(agentDir, 'memories.md');
	if (!fs.existsSync(memoriesPath)) {
		fs.writeFileSync(memoriesPath,
			`# Project Memories\n\n> Persistent context across sessions.\n\n## Project\n- Goal: ${goal}\n- Created: ${new Date().toISOString().slice(0, 10)}\n`,
			'utf-8'
		);
	}

	const prompt = buildInitPrompt(goal, root);
	try {
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt, isPartialQuery: false
		});
		vscode.window.showInformationMessage('Generating prd.json via Chat — open Kanban once the file is created.');
	} catch {
		await vscode.env.clipboard.writeText(prompt);
		vscode.window.showInformationMessage('Prompt copied — paste in Chat to generate prd.json.');
	}
	output.appendLine(`[Ralph] Init project: ${goal}`);
}

function buildInitPrompt(goal: string, workspaceRoot: string): string {
	return `Analyze this workspace and generate a prd.json file at the workspace root.

Goal: ${goal}
Workspace: ${workspaceRoot}

Generate the file following EXACTLY this schema:

\`\`\`json
{
  "project": "ProjectName",
  "description": "Short description",
  "version": "1.0.0",
  "issues": [
    {
      "id": "ISSUE-001",
      "title": "Setup base structure",
      "description": "What to implement",
      "epic": "Setup",
      "priority": "P0",
      "status": "todo",
      "acceptanceCriteria": ["criterion 1", "criterion 2"],
      "dependencies": [],
      "labels": ["setup"]
    }
  ]
}
\`\`\`

Rules:
- id format: ISSUE-NNN (sequential)
- priority: P0 (critical) > P1 (high) > P2 (medium) > P3 (low)
- status always "todo" for new issues
- After each feature issue, add a git commit issue
- All paths must be relative and portable
- Actually CREATE the file at ${workspaceRoot}/prd.json — do not just show content`;
}

// ── Project Setup (AGENTS.md + plans/) ───────────────────────────────────────

export async function setupProject(output: vscode.OutputChannel) {
	const root = getWorkspaceRoot();
	if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }

	const agentsPath = path.join(root, 'AGENTS.md');
	const exists     = fs.existsSync(agentsPath);

	if (exists) {
		const action = await vscode.window.showInformationMessage(
			'AGENTS.md already exists. What do you want to do?',
			'Regenerate from Settings', 'Open to edit', 'Cancel'
		);
		if (!action || action === 'Cancel') { return; }
		if (action === 'Open to edit') {
			const doc = await vscode.workspace.openTextDocument(agentsPath);
			await vscode.window.showTextDocument(doc);
			return;
		}
	}

	const cfg = vscode.workspace.getConfiguration('ralph-suite');
	let role       = cfg.get<string>('agentRole', 'Senior Software Engineer');
	let stack      = cfg.get<string>('agentStack', '');
	let project    = cfg.get<string>('agentProject', '');
	const checkpoints = cfg.get<string[]>('agentCheckpoints', []);
	const guardrails  = cfg.get<string[]>('guardrails', []);

	// If key fields are empty, prompt to fill them in first
	if (!stack || !project) {
		const fillNow = await vscode.window.showWarningMessage(
			'agentStack and agentProject are empty in Settings. Fill them now for a better AGENTS.md, or generate with defaults.',
			'Open Settings', 'Generate anyway'
		);
		if (fillNow === 'Open Settings') {
			vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite.agentStack');
			return;
		}
	}

	// Generate all files
	const plansDir = path.join(root, 'plans');
	if (!fs.existsSync(plansDir)) { fs.mkdirSync(plansDir, { recursive: true }); }

	const now = new Date().toISOString().slice(0, 10);

	// 1. AGENTS.md
	const agentsContent = buildAgentsMd(role, stack, project, checkpoints, guardrails, now);
	fs.writeFileSync(agentsPath, agentsContent, 'utf-8');
	output.appendLine('[Setup] AGENTS.md written');

	// 2. .github/copilot-instructions.md
	const githubDir = path.join(root, '.github');
	if (!fs.existsSync(githubDir)) { fs.mkdirSync(githubDir, { recursive: true }); }
	const copilotInstr = path.join(githubDir, 'copilot-instructions.md');
	if (!fs.existsSync(copilotInstr)) {
		fs.writeFileSync(copilotInstr, buildCopilotInstructions(project, stack), 'utf-8');
		output.appendLine('[Setup] .github/copilot-instructions.md written');
	}

	// 3. plans/ files — only create if they don't exist (never overwrite user edits)
	const planFiles: Record<string, string> = {
		'arquitectura.md': buildArquitecturaMd(project, stack, now),
		'seguridad.md':    buildSeguridadMd(project, now),
		'decisiones.md':   buildDecisionesMd(project, now),
	};
	for (const [filename, content] of Object.entries(planFiles)) {
		const p = path.join(plansDir, filename);
		if (!fs.existsSync(p)) {
			fs.writeFileSync(p, content, 'utf-8');
			output.appendLine(`[Setup] plans/${filename} written`);
		} else {
			output.appendLine(`[Setup] plans/${filename} already exists — skipped`);
		}
	}

	vscode.window.showInformationMessage(
		`AGENTS.md generated. Plans created in plans/. Edit them to match your project.`,
		'Open AGENTS.md'
	).then(action => {
		if (action === 'Open AGENTS.md') {
			vscode.workspace.openTextDocument(agentsPath)
				.then(doc => vscode.window.showTextDocument(doc));
		}
	});
}

// ── File content builders ─────────────────────────────────────────────────────

function buildAgentsMd(
	role: string,
	stack: string,
	project: string,
	checkpoints: string[],
	guardrails: string[],
	date: string
): string {
	const stackLines = stack
		? stack.split(',').map(s => `- ${s.trim()}`).join('\n')
		: '- (define in ralph-suite.agentStack setting)';

	const checkpointList = checkpoints.length
		? checkpoints.map((c, i) => `${i + 1}. ${c}`).join('\n')
		: '1. Delete files or directories\n2. Modify database schemas\n3. Change security configuration';

	const guardrailList = guardrails.length
		? guardrails.map(g => `- ${g}`).join('\n')
		: '- Never modify prd.json\n- Never delete files without confirmation';

	return `# AGENTS.md — Project Agent Manual

> **Project:** ${project || '(define in ralph-suite.agentProject setting)'}
> **Generated:** ${date} by Ralph Suite
> **Regenerate:** Open board → ⚙ Setup Project

---

## [R] ROLE

You are a **${role}** working on this project.

**Tech Stack:**
${stackLines}

**Expertise:** Architecture, implementation, testing, security, code quality.

---

## [A] AUDIENCE

The lead developer of this project. Assume:
- Expert knowledge of the tech stack above
- Familiarity with Git, testing patterns, and code conventions
- No need to explain basic concepts — go straight to implementation

---

## [L] LIMITS — Rules to follow always

${guardrailList}

### Checkpoint Protocol

Before executing any of these actions, **STOP and request confirmation:**

${checkpointList}

**Checkpoint format:**
\`\`\`
🛑 CHECKPOINT REQUIRED

Action: [what you are about to do]
Impact: [what gets affected]
Risk: low / medium / high
Rollback: [how to undo if it fails]

Proceed? (y/n)
\`\`\`

---

## [P] PURPOSE

**Working code first → brief justification after.**

Response format:
1. Direct implementation
2. Technical justification (1–3 lines max)
3. Additional detail only if genuinely complex

---

## [H] HOOK — Tone & Style

- **Radical honesty:** if something is inefficient, say so
- **No padding:** skip preambles, pleasantries, and summaries of what you just did
- If you spot technical debt, document it in \`.agent/memories.md\`
- Never end a task with open questions unless the task explicitly asks for them

---

## Project Context

Read these files before starting work:
- \`.agent/memories.md\` — accumulated project knowledge
- \`plans/arquitectura.md\` — architecture decisions
- \`plans/seguridad.md\` — security requirements
- \`plans/decisiones.md\` — ADR log (why X was chosen over Y)
- \`prd.json\` — current task backlog

---

## Completion Protocol

When a task is finished, write **both** signals:

1. \`completed\` → \`.ralph/task-<ID>-status\`
2. \`NOTA: <one line summary>\` → \`.ralph/task-<ID>-note\`

Then **stop and wait for the next instruction.** Do not ask questions.

---

## Security Requirements

- Never hardcode secrets, tokens, or passwords — use environment variables
- Validate and sanitize all user inputs before processing
- Follow existing auth patterns in the codebase
- See \`plans/seguridad.md\` for project-specific security rules

---

## Testing

- Run existing tests before marking any task as completed
- New features must include tests
- Do not break passing tests — if a test fails, fix it or flag it explicitly
- Test coverage is a quality signal, not a checkbox

---

*Generated by Ralph Suite ${date}*
`;
}

function buildCopilotInstructions(project: string, stack: string): string {
	return `# GitHub Copilot Instructions

> See [AGENTS.md](../AGENTS.md) for the full agent protocol.

## Quick Reference

**Project:** ${project || 'See AGENTS.md'}
**Stack:** ${stack || 'See AGENTS.md'}

## Critical Rules

1. Read \`.agent/memories.md\` before starting any task
2. All code follows conventions already in the codebase
3. Tests required for new features
4. Never commit secrets — use environment variables
5. Checkpoint before: file deletion, DB changes, security changes, major refactors
6. Write completion signals when done — do not ask follow-up questions

## Plans

- \`plans/arquitectura.md\` — architecture decisions
- \`plans/seguridad.md\` — security requirements
- \`plans/decisiones.md\` — decision log
`;
}

function buildArquitecturaMd(project: string, stack: string, date: string): string {
	return `# Architecture — ${project || 'Project'}

> Last updated: ${date}
> Keep this document updated when making architectural decisions.

## Overview

[Describe the high-level architecture here]

## Tech Stack

${stack ? stack.split(',').map(s => `- ${s.trim()}`).join('\n') : '- (fill in your stack)'}

## Project Structure

\`\`\`
/
├── (add your structure here)
\`\`\`

## Key Architectural Decisions

### Structure
- [Describe how the project is organised and why]

### Data Flow
- [Describe how data moves through the system]

### External Services
- [List external APIs, services, and why they were chosen]

## Patterns & Conventions

- **Naming:** [snake_case / camelCase / etc.]
- **Error handling:** [how errors are handled]
- **Logging:** [what gets logged and where]
- **Configuration:** [how config/secrets are managed]

## What NOT to change without discussion

- [List architectural decisions that are locked]

---

*Update this file whenever the architecture changes.*
`;
}

function buildSeguridadMd(project: string, date: string): string {
	return `# Security — ${project || 'Project'}

> Last updated: ${date}
> The agent must read this before touching authentication, secrets, or external APIs.

## Secrets Management

- **Never** hardcode API keys, tokens, passwords, or credentials
- All secrets go in environment variables (e.g. \`.env\`, not committed)
- Add secret variable names to \`.env.example\` with placeholder values
- Document required secrets here:

| Variable | Purpose | Where to get it |
|----------|---------|----------------|
| (add rows) | | |

## Authentication & Authorisation

- [Describe the auth mechanism used: JWT, sessions, OAuth, etc.]
- [List which endpoints/routes require authentication]
- [Describe role/permission model if applicable]

## Input Validation

- Validate and sanitize ALL user inputs before processing
- [List specific validation rules for critical inputs]

## CORS & Headers

- [Describe CORS configuration and allowed origins]
- [List security headers in use: CSP, X-Frame-Options, etc.]

## Checkpoints Required

The agent must stop and ask before:
- Changing authentication logic
- Adding new public endpoints
- Modifying CORS configuration
- Changing how secrets are loaded or used

## Known Vulnerabilities to Avoid

- SQL/NoSQL injection → use parameterised queries
- XSS → sanitise all output
- Path traversal → validate file paths
- Command injection → never execute shell commands with user input

---

*Update when security requirements change.*
`;
}

function buildDecisionesMd(project: string, date: string): string {
	return `# Decision Log — ${project || 'Project'}

> Architecture Decision Records (ADRs).
> Document WHY decisions were made, not just what was decided.
> The agent reads this to avoid undoing intentional choices.

## Format

\`\`\`markdown
### ADR-NNN: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated

**Context:** Why did this decision need to be made?

**Decision:** What was decided?

**Consequences:**
- ✅ [benefit]
- ⚠️ [trade-off]

**Alternatives considered:**
- [Option A] — rejected because [reason]
\`\`\`

---

## Decisions

### ADR-001: Initial project setup

**Date:** ${date}
**Status:** Accepted

**Context:** Project initialised with Ralph Suite.

**Decision:** Use \`prd.json\` for task tracking, \`.agent/memories.md\` for persistent context, and \`plans/\` for architectural documentation.

**Consequences:**
- ✅ Single source of truth for tasks and architecture
- ✅ Agent has persistent context across sessions
- ⚠️ Requires keeping plans/ updated as the project evolves

---

*Add a new ADR every time a significant technical decision is made.*
`;
}
