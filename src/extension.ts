import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { KanbanPanel } from './kanbanPanel';
import { RalphStateManager } from './stateManager';
import { PrdManager } from './prdManager';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Ralph Suite');
	context.subscriptions.push(output);

	// Status bar
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = '$(layout-panel) Ralph';
	statusBar.tooltip = 'Ralph Suite — click to open board';
	statusBar.command = 'ralph-suite.openKanban';
	statusBar.show();
	context.subscriptions.push(statusBar);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('ralph-suite.openKanban', () => {
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			KanbanPanel.createOrShow(context.extensionUri, root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.initProject', () => {
			initProject(output);
		}),

		vscode.commands.registerCommand('ralph-suite.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite');
		}),

		vscode.commands.registerCommand('ralph-suite.runTask', async (taskId?: string) => {
			const root = getWorkspaceRoot();
			if (!root) return;
			const prd = PrdManager.load(root);
			if (!prd) { vscode.window.showErrorMessage('No prd.json found.'); return; }

			let task = taskId ? prd.issues.find(i => i.id === taskId) : PrdManager.nextPending(prd, root);
			if (!task) { vscode.window.showInformationMessage('No pending tasks.'); return; }

			const prompt      = buildPrompt(task, prd, root);
			const freshContext = vscode.workspace.getConfiguration('ralph-suite').get<boolean>('freshContext', true);
			try {
				// Open a fresh chat window per task when freshContext is enabled
				if (freshContext) {
					await vscode.commands.executeCommand('workbench.action.chat.newChat');
					await new Promise(r => setTimeout(r, 400)); // let new chat initialise
				}
				await vscode.commands.executeCommand('workbench.action.chat.open', {
					query: prompt, isPartialQuery: false
				});
				RalphStateManager.setInProgress(root, task.id);
				KanbanPanel.refresh();
				output.appendLine(`[Ralph] Running task ${task.id}: ${task.title}${freshContext ? ' (fresh context)' : ''}`);
			} catch {
				await vscode.env.clipboard.writeText(prompt);
				vscode.window.showInformationMessage('Prompt copied to clipboard — paste in Chat.');
			}
		}),

		vscode.commands.registerCommand('ralph-suite.markDone', async (taskId: string) => {
			const root = getWorkspaceRoot();
			if (!root) return;
			RalphStateManager.setCompleted(root, taskId);
			KanbanPanel.refresh();
		}),

		vscode.commands.registerCommand('ralph-suite.resetTask', async (taskId: string) => {
			const root = getWorkspaceRoot();
			if (!root) return;
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
		guardrails.length ? `\n**Rules (follow always):**\n${guardrails.map(g => `- ${g}`).join('\n')}` : '',
		boundaries.length ? `\n**Never touch these paths:**\n${boundaries.map(b => `- ${b}`).join('\n')}` : '',
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
	].filter(l => l !== null);
	return lines.join('\n');
}


function loadMemory(root: string): string | null {
	const p = path.join(root, '.agent', 'memories.md');
	if (!fs.existsSync(p)) return null;
	const content = fs.readFileSync(p, 'utf-8').trim();
	return content.length > 0 ? content : null;
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

	// Warn if .ralph/ has leftover state from a previous project
	if (fs.existsSync(ralphDir)) {
		const statusFiles = fs.readdirSync(ralphDir).filter(f => f.endsWith('-status'));
		if (statusFiles.length > 0) {
			const action = await vscode.window.showWarningMessage(
				`Found ${statusFiles.length} task status file(s) in .ralph/ from a previous project. These may cause ghost states on the new board.`,
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
	if (!goal) return;

	// Create .agent/ dir and memories.md
	const agentDir = path.join(root, '.agent');
	if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
	const memoriesPath = path.join(agentDir, 'memories.md');
	if (!fs.existsSync(memoriesPath)) {
		fs.writeFileSync(memoriesPath, `# Project Memories\n\n> Persistent context across sessions.\n\n## Project\n- Goal: ${goal}\n- Created: ${new Date().toISOString().slice(0, 10)}\n`, 'utf-8');
	}

	// Generate prd.json via chat
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
