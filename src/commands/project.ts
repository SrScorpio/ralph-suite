/**
 * project.ts — Comandos initProject y setupProject
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PrdManager } from '../prdManager';
import { RalphStateManager } from '../stateManager';
import { KanbanPanel } from '../kanbanPanel';
import { buildInitPrompt } from '../promptBuilders';
import {
	buildAgentsMd,
	buildCopilotInstructions,
	buildArquitecturaMd,
	buildSeguridadMd,
	buildDecisionesMd,
} from '../agentsMdBuilders';
import { sendToChat } from '../chatLauncher';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getPrdPathSetting(): string {
	return vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', 'prd.json');
}
