/**
 * project.ts — Comandos initProject y setupProject
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PRD_PATH, PrdManager } from '../prdManager';
import { RalphStateManager } from '../stateManager';
import { KanbanPanel } from '../kanbanPanel';
import { buildInitPrompt } from '../promptBuilders';
import { buildGeneratedProjectFiles } from '../agentsMdBuilders';
import { sendToChat } from '../chatLauncher';
import { resolveWorkspaceRoot } from '../workspaceRoot';

// ── Init project ─────────────────────────────────────────────────────────────

export async function initProject(root: string, output: vscode.OutputChannel): Promise<void> {
	const prdPath  = PrdManager.prdPath(root, getPrdPathSetting());
	const ralphDir = path.join(root, '.ralph');

	if (fs.existsSync(prdPath)) {
		const action = await vscode.window.showInformationMessage(
			'prd.json already exists.', 'Open Kanban', 'Cancel'
		);
		if (action === 'Open Kanban') { vscode.commands.executeCommand('ralph-suite.openKanban'); }
		return;
	}

	if (fs.existsSync(ralphDir)) {
		const statusFiles = fs.readdirSync(ralphDir).filter((f: string) => f.endsWith('-status'));
		if (statusFiles.length > 0) {
			const action = await vscode.window.showWarningMessage(
				`Found ${statusFiles.length} task status file(s) in .ralph/ from a previous project.`,
				'Clear .ralph/ and continue', 'Continue anyway', 'Cancel'
			);
			if (!action || action === 'Cancel') { return; }
			if (action === 'Clear .ralph/ and continue') {
				for (const f of fs.readdirSync(ralphDir) as string[]) {
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

	// Create memories.md at the configured path (default: .agent/memories.md)
	const memCfg = vscode.workspace.getConfiguration('ralph-suite').get<string>('memoriesPath', '.agent/memories.md');
	const memoriesPath = path.isAbsolute(memCfg) ? memCfg : path.join(root, memCfg);
	const agentDir = path.dirname(memoriesPath);
	if (!fs.existsSync(agentDir)) { fs.mkdirSync(agentDir, { recursive: true }); }
	if (!fs.existsSync(memoriesPath)) {
		fs.writeFileSync(memoriesPath,
			`# Project Memories\n\n## Project\n- Goal: ${goal}\n- Created: ${new Date().toISOString().slice(0, 10)}\n`,
			'utf-8'
		);
	}

	const prompt = buildInitPrompt(goal, root);
	output.appendLine(`[Ralph] Init prompt: ${prompt.length} chars`);

	const sent = await sendToChat(prompt);
	if (!sent) {
		output.appendLine('[Ralph] Chat unavailable — prompt copied to clipboard');
		return;
	}
	output.appendLine('[Ralph] Chat opened');

	vscode.window.showInformationMessage('Chat opened. When prd.json is created, open the board.');

	// Poll for prd.json
	const prdPath2 = PrdManager.prdPath(root, getPrdPathSetting());
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

// ── Setup project ────────────────────────────────────────────────────────────

export async function setupProject(output: vscode.OutputChannel): Promise<void> {
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

	const now = new Date().toISOString().slice(0, 10);
	const files = buildGeneratedProjectFiles(role, stack, project, checkpoints, guardrails, now);

	for (const file of files) {
		const target = path.join(root, file.path);
		const dir = path.dirname(target);
		if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
		if (file.path === 'AGENTS.md' || !fs.existsSync(target)) {
			fs.writeFileSync(target, file.content, 'utf-8');
			output.appendLine(`[Setup] ${file.path} written`);
		} else {
			output.appendLine(`[Setup] ${file.path} already exists — skipped`);
		}
	}

	vscode.window.showInformationMessage('AGENTS.md generated.', 'Open AGENTS.md').then(a => {
		if (a === 'Open AGENTS.md') {
			vscode.workspace.openTextDocument(agentsPath).then(doc => vscode.window.showTextDocument(doc));
		}
	});
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
	return resolveWorkspaceRoot(
		vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath),
		getPrdPathSetting(),
	);
}

function getPrdPathSetting(): string {
	return vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', DEFAULT_PRD_PATH) ?? DEFAULT_PRD_PATH;
}
