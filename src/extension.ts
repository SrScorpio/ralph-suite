import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { KanbanPanel } from './kanbanPanel';
import { RalphStateManager } from './stateManager';
import { PrdManager } from './prdManager';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Ralph Suite');
	context.subscriptions.push(output);
	output.appendLine('[Ralph] ===== ACTIVATING v1.6.5 =====');
	output.show(); // Force show output on activation

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = '$(layout-panel) Ralph';
	statusBar.tooltip = 'Ralph Suite';
	statusBar.command = 'ralph-suite.showMenu';
	statusBar.show();
	context.subscriptions.push(statusBar);

	// Register ALL commands
	context.subscriptions.push(

		vscode.commands.registerCommand('ralph-suite.showMenu', async () => {
			output.appendLine('[Ralph] showMenu triggered');
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

		vscode.commands.registerCommand('ralph-suite.openKanban', () => {
			output.appendLine('[Ralph] openKanban triggered');
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

		vscode.commands.registerCommand('ralph-suite.setupProject', () => {
			output.appendLine('[Ralph] setupProject triggered');
			setupProject(root => root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.initProject', () => {
			output.appendLine('[Ralph] initProject triggered');
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			initProject(root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite');
		}),

		vscode.commands.registerCommand('ralph-suite.runTask', async (taskId?: string) => {
			output.appendLine(`[Ralph] runTask triggered: ${taskId ?? 'auto'}`);
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

	// File watchers
	const workspaceRoot = getWorkspaceRoot();
	if (workspaceRoot) {
		const prdWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(workspaceRoot, 'prd.json')
		);
		prdWatcher.onDidChange(() => { output.appendLine('[Ralph] prd.json changed'); KanbanPanel.refresh(); });
		prdWatcher.onDidCreate(() => { output.appendLine('[Ralph] prd.json created'); KanbanPanel.refresh(); });
		prdWatcher.onDidDelete(() => KanbanPanel.refresh());
		context.subscriptions.push(prdWatcher);
	}

	output.appendLine('[Ralph] ===== ACTIVATION COMPLETE =====');
}

export function deactivate() {}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function initProject(root: string, output: vscode.OutputChannel) {
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

	// Create .agent/memories.md
	const agentDir = path.join(root, '.agent');
	if (!fs.existsSync(agentDir)) { fs.mkdirSync(agentDir, { recursive: true }); }
	const memoriesPath = path.join(agentDir, 'memories.md');
	if (!fs.existsSync(memoriesPath)) {
		fs.writeFileSync(memoriesPath,
			`# Project Memories\n\n## Project\n- Goal: ${goal}\n- Created: ${new Date().toISOString().slice(0, 10)}\n`,
			'utf-8'
		);
	}

	const prompt = buildInitPrompt(goal, root);
	output.appendLine(`[Ralph] Init prompt: ${prompt.length} chars`);

	try {
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt, isPartialQuery: false
		});
		output.appendLine('[Ralph] Chat opened');
	} catch (e) {
		output.appendLine(`[Ralph] Chat failed: ${e} — copying to clipboard`);
		await vscode.env.clipboard.writeText(prompt);
		vscode.window.showInformationMessage('Prompt copied to clipboard — paste in Chat.');
		return;
	}

	vscode.window.showInformationMessage('Chat opened. When prd.json is created, open the board.');

	// Poll for prd.json
	const prdPath2 = path.join(root, 'prd.json');
	let polls = 0;
	const timer = setInterval(() => {
		polls++;
		if (fs.existsSync(prdPath2)) {
			clearInterval(timer);
			output.appendLine('[Ralph] prd.json detected!');
			KanbanPanel.refresh();
			vscode.window.showInformationMessage('prd.json created!', 'Open Board').then(a => {
				if (a === 'Open Board') { vscode.commands.executeCommand('ralph-suite.openKanban'); }
			});
		} else if (polls >= 120) {
			clearInterval(timer);
			output.appendLine('[Ralph] Poll timeout — prd.json not found after 10min');
		}
	}, 5000);
}

async function setupProject(_getRootFn: (x: any) => any, output: vscode.OutputChannel) {
	const root = getWorkspaceRoot();
	if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }

	const agentsPath = path.join(root, 'AGENTS.md');
	if (fs.existsSync(agentsPath)) {
		const action = await vscode.window.showInformationMessage(
			'AGENTS.md already exists.', 'Regenerate', 'Open to edit', 'Cancel'
		);
		if (!action || action === 'Cancel') { return; }
		if (action === 'Open to edit') {
			const doc = await vscode.workspace.openTextDocument(agentsPath);
			await vscode.window.showTextDocument(doc);
			return;
		}
	}

	const cfg          = vscode.workspace.getConfiguration('ralph-suite');
	const role         = cfg.get<string>('agentRole', 'Senior Software Engineer');
	const stack        = cfg.get<string>('agentStack', '');
	const project      = cfg.get<string>('agentProject', '');
	const checkpoints  = cfg.get<string[]>('agentCheckpoints', []);
	const guardrails   = cfg.get<string[]>('guardrails', []);

	if (!stack || !project) {
		const action = await vscode.window.showWarningMessage(
			'agentStack and agentProject are empty. Fill them in Settings for a better AGENTS.md.',
			'Open Settings', 'Generate anyway'
		);
		if (action === 'Open Settings') {
			vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite.agentStack');
			return;
		}
	}

	const plansDir = path.join(root, 'plans');
	if (!fs.existsSync(plansDir)) { fs.mkdirSync(plansDir, { recursive: true }); }
	const githubDir = path.join(root, '.github');
	if (!fs.existsSync(githubDir)) { fs.mkdirSync(githubDir, { recursive: true }); }

	const now = new Date().toISOString().slice(0, 10);

	fs.writeFileSync(agentsPath, buildAgentsMd(role, stack, project, checkpoints, guardrails, now), 'utf-8');
	output.appendLine('[Setup] AGENTS.md written');

	const copilotInstr = path.join(githubDir, 'copilot-instructions.md');
	if (!fs.existsSync(copilotInstr)) {
		fs.writeFileSync(copilotInstr, buildCopilotInstructions(project, stack), 'utf-8');
		output.appendLine('[Setup] .github/copilot-instructions.md written');
	}

	for (const [fn, content] of Object.entries({
		'arquitectura.md': buildArquitecturaMd(project, stack, now),
		'seguridad.md':    buildSeguridadMd(project, now),
		'decisiones.md':   buildDecisionesMd(project, now),
	})) {
		const p = path.join(plansDir, fn);
		if (!fs.existsSync(p)) {
			fs.writeFileSync(p, content, 'utf-8');
			output.appendLine(`[Setup] plans/${fn} written`);
		} else {
			output.appendLine(`[Setup] plans/${fn} already exists — skipped`);
		}
	}

	vscode.window.showInformationMessage('AGENTS.md generated.', 'Open AGENTS.md').then(a => {
		if (a === 'Open AGENTS.md') {
			vscode.workspace.openTextDocument(agentsPath).then(doc => vscode.window.showTextDocument(doc));
		}
	});
}

// ── Task runner ───────────────────────────────────────────────────────────────

async function runTaskWithRetry(
	task: any, prompt: string, root: string,
	freshContext: boolean, minWaitMs: number, timeoutMs: number,
	retries: number, output: vscode.OutputChannel
): Promise<void> {
	const pollMs = vscode.workspace.getConfiguration('ralph-suite').get<number>('pollIntervalMs', 5000);

	for (let attempt = 1; attempt <= retries + 1; attempt++) {
		if (attempt > 1) {
			output.appendLine(`[Ralph] Retry ${attempt}/${retries + 1} for ${task.id}`);
		}
		try {
			if (freshContext) {
				await vscode.commands.executeCommand('workbench.action.chat.newChat');
				await sleep(400);
			}
			await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt, isPartialQuery: false });
		} catch {
			await vscode.env.clipboard.writeText(prompt);
			vscode.window.showInformationMessage('Prompt copied — paste in Chat.');
			return;
		}

		RalphStateManager.setInProgress(root, task.id, task.title);
		KanbanPanel.refresh();
		output.appendLine(`[Ralph] Task ${task.id} started — waiting ${minWaitMs / 1000}s`);
		await sleep(minWaitMs);

		const startedAt = Date.now();
		let completed = false;
		while (Date.now() - startedAt < timeoutMs - minWaitMs) {
			if (RalphStateManager.getStatus(root, task.id) === 'completed') {
				completed = true;
				output.appendLine(`[Ralph] ✓ ${task.id} completed`);
				break;
			}
			await sleep(pollMs);
		}
		if (completed) { return; }

		output.appendLine(`[Ralph] ⚠ ${task.id} timed out`);
		if (attempt <= retries) {
			RalphStateManager.reset(root, task.id);
			KanbanPanel.refresh();
		} else {
			RalphStateManager.setFailed(root, task.id, `Timed out after ${retries + 1} attempts`);
			KanbanPanel.refresh();
			vscode.window.showWarningMessage(`Ralph: ${task.id} timed out`, 'Open Output')
				.then(a => { if (a === 'Open Output') { output.show(); } });
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPrompt(task: any, prd: any, workspaceRoot: string): string {
	const memory = loadMemory(workspaceRoot);
	const cfg    = vscode.workspace.getConfiguration('ralph-suite');
	const guardrails: string[] = cfg.get('guardrails', []);
	const boundaries: string[] = cfg.get('boundaries', []);
	const ralphDir   = path.join(workspaceRoot, '.ralph').replace(/\\/g, '/');
	const statusFile = `${ralphDir}/task-${task.id}-status`;
	const noteFile   = `${ralphDir}/task-${task.id}-note`;

	return [
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
		'Execute directly. No questions. Keep passing parts if something fails.',
		'⚠️ Do NOT modify prd.json.',
		'',
		'━━━ COMPLETION SIGNALS (both required) ━━━',
		`1. Write (overwrite, not append) the single word \`completed\` to: ${statusFile}`,
		`   The file must contain ONLY the word "completed" — nothing else, no extra lines.`,
		`2. Write \`NOTA: <one line summary>\` to: ${noteFile}`,
		`   Example: NOTA: Created plugin skeleton with admin menu and REST endpoint stubs`,
		'Do NOT skip either step. Do NOT append — overwrite.',
	].filter(Boolean).join('\n');
}

function buildInitPrompt(goal: string, workspaceRoot: string): string {
	const cfg         = vscode.workspace.getConfiguration('ralph-suite');
	const guardrails  = cfg.get<string[]>('guardrails', []);
	const checkpoints = cfg.get<string[]>('agentCheckpoints', []);
	const guardrailList  = guardrails.map(g => `- ${g}`).join('\n') || '- Never modify prd.json';
	const checkpointList = checkpoints.map((c, i) => `${i + 1}. ${c}`).join('\n') || '1. Delete files\n2. Modify DB schemas';

	return `You are a senior software architect helping set up a new project with the Ralph Suite workflow.

The user wants to build: **${goal}**

## Your job

1. Ask clarifying questions to understand the project fully (stack, features, constraints, security needs)
2. Once you have enough context, generate ALL of these files in one go:

### File 1: AGENTS.md (workspace root)
\`\`\`
# AGENTS.md — Project Agent Manual
> Project: [name] | Stack: [stack] | Generated: [date]

## Role
You are a Senior Software Engineer working on [project].
**Stack:** [list]

## Rules
${guardrailList}

## Checkpoints (stop and ask before these)
${checkpointList}

## Before starting any task, read:
- .agent/memories.md
- plans/arquitectura.md
- plans/seguridad.md
- plans/decisiones.md

## Completion protocol
1. Overwrite (not append) .ralph/task-<ID>-status with the single word: completed
   The file must contain ONLY that word — no extra lines, no other content.
2. Write NOTA: <one line summary> to .ralph/task-<ID>-note
Then stop. No follow-up questions.
\`\`\`

### File 2: .github/copilot-instructions.md
Brief — references AGENTS.md, lists 3 critical rules.

### File 3: plans/arquitectura.md
Real architecture decisions from the conversation.

### File 4: plans/seguridad.md
Security rules, secrets, auth, CORS for this project.

### File 5: plans/decisiones.md
ADR-001 for stack choice + one ADR per major decision.

### File 6: prd.json (workspace root)
\`\`\`json
{
  "project": "Name",
  "description": "Short description",
  "version": "1.0.0",
  "issues": [{
    "id": "ISSUE-001",
    "title": "...",
    "description": "...",
    "epic": "Setup",
    "priority": "P0",
    "status": "todo",
    "acceptanceCriteria": ["..."],
    "dependencies": [],
    "labels": []
  }]
}
\`\`\`
Rules: ISSUE-NNN ids, P0>P1>P2>P3, status always "todo", add git commit after each feature issue.
CREATE the file at: ${workspaceRoot}/prd.json

## Important
- Start with questions — do NOT generate files until you understand the project
- Generate ALL 6 files at once when ready
- Workspace root: \`${workspaceRoot}\``;
}

function loadMemory(root: string): string | null {
	const p = path.join(root, '.agent', 'memories.md');
	if (!fs.existsSync(p)) { return null; }
	return fs.readFileSync(p, 'utf-8').trim() || null;
}

// ── AGENTS.md builders ────────────────────────────────────────────────────────

function buildAgentsMd(role: string, stack: string, project: string, checkpoints: string[], guardrails: string[], date: string): string {
	const stackLines     = stack ? stack.split(',').map(s => `- ${s.trim()}`).join('\n') : '- (define in Settings)';
	const checkpointList = checkpoints.length ? checkpoints.map((c, i) => `${i + 1}. ${c}`).join('\n') : '1. Delete files\n2. Modify DB schemas\n3. Change security config';
	const guardrailList  = guardrails.length  ? guardrails.map(g => `- ${g}`).join('\n')  : '- Never modify prd.json\n- Never delete files without confirmation';

	return `# AGENTS.md — Project Agent Manual

> **Project:** ${project || '(define in Settings → ralph-suite.agentProject)'}
> **Generated:** ${date} by Ralph Suite

## Role
You are a **${role}** working on this project.

**Stack:**
${stackLines}

## Rules (always follow)
${guardrailList}

## Checkpoints (stop and ask before these)
${checkpointList}

## Before starting any task, read:
- \`.agent/memories.md\` — accumulated project knowledge
- \`plans/arquitectura.md\` — architecture decisions
- \`plans/seguridad.md\` — security requirements
- \`plans/decisiones.md\` — decision log
- \`prd.json\` — task backlog

## Completion protocol
1. Overwrite (not append) \`.ralph/task-<ID>-status\` with the single word: \`completed\`
   File must contain ONLY that word — no extra lines, no other content.
2. Write \`NOTA: <one line summary>\` → \`.ralph/task-<ID>-note\`
Then stop and wait. Do not ask follow-up questions.

## Testing
- Run existing tests before marking any task completed
- New features require tests
- Do not break passing tests

*Generated by Ralph Suite ${date}*
`;
}

function buildCopilotInstructions(project: string, stack: string): string {
	return `# GitHub Copilot Instructions
> See [AGENTS.md](../AGENTS.md) for the full protocol.

**Project:** ${project || 'See AGENTS.md'}
**Stack:** ${stack || 'See AGENTS.md'}

## Critical Rules
1. Read \`.agent/memories.md\` before starting any task
2. Follow conventions already in the codebase
3. Tests required for new features
4. Never commit secrets — use environment variables
5. Write completion signals when done
`;
}

function buildArquitecturaMd(project: string, stack: string, date: string): string {
	return `# Architecture — ${project || 'Project'}
> Last updated: ${date}

## Stack
${stack ? stack.split(',').map(s => `- ${s.trim()}`).join('\n') : '- (fill in)'}

## Structure
\`\`\`
/ (add your structure)
\`\`\`

## Key Decisions
- [Describe architecture and why]

## Conventions
- Naming: [snake_case / camelCase]
- Error handling: [describe]
- Config/secrets: [describe]

## Locked decisions (do not change without discussion)
- [list]
`;
}

function buildSeguridadMd(project: string, date: string): string {
	return `# Security — ${project || 'Project'}
> Last updated: ${date}

## Secrets
- Never hardcode — use environment variables
- Document required vars:

| Variable | Purpose |
|----------|---------|
| (add) | |

## Auth
- [Describe mechanism]

## Checkpoints required before:
- Changing auth logic
- Adding public endpoints
- Modifying CORS
- Changing how secrets are loaded
`;
}

function buildDecisionesMd(project: string, date: string): string {
	return `# Decision Log — ${project || 'Project'}

## ADR-001: Project setup
**Date:** ${date} | **Status:** Accepted

**Decision:** Use prd.json for tasks, .agent/memories.md for context, plans/ for architecture docs.

**Consequences:**
- ✅ Single source of truth
- ⚠️ Requires keeping plans/ updated

---
*Add ADR-NNN for each significant technical decision.*
`;
}
