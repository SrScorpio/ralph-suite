/**
 * activate.ts — Registro de comandos y watchers de VS Code
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import { KanbanPanel } from './kanbanPanel';
import { RalphStateManager } from './stateManager';
import { DEFAULT_PRD_PATH, PrdManager, prdWatchPattern } from './prdManager';
import { showMenu } from './commands/menu';
import { initProject, setupProject } from './commands/project';
import { runTaskWithRetry } from './commands/task';
import { optimizeMemory } from './commands/memory';
import { buildPrompt } from './promptBuilders';
import { resolveWorkspaceRoot } from './workspaceRoot';

export function _doActivate(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
	// Status bar
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = '$(layout-panel) Ralph';
	statusBar.tooltip = 'Ralph Suite';
	statusBar.command = 'ralph-suite.showMenu';
	statusBar.show();
	context.subscriptions.push(statusBar);

	// Register all commands
	context.subscriptions.push(

		vscode.commands.registerCommand('ralph-suite.showMenu', () => {
			output.appendLine('[Ralph] showMenu triggered');
			showMenu(output);
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
			setupProject(output);
		}),

		vscode.commands.registerCommand('ralph-suite.initProject', () => {
			output.appendLine('[Ralph] initProject triggered');
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			initProject(root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.optimizeMemory', async () => {
			output.appendLine('[Ralph] optimizeMemory triggered');
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			const cfg       = vscode.workspace.getConfiguration('ralph-suite');
			const review = cfg.get<boolean>('memoryOptimizeReview', true);
			await optimizeMemory(root, output, review);
		}),

		vscode.commands.registerCommand('ralph-suite.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite');
		}),

		vscode.commands.registerCommand('ralph-suite.runTask', async (taskId?: string) => {
			output.appendLine(`[Ralph] runTask triggered: ${taskId ?? 'auto'}`);
			const root = getWorkspaceRoot();
			if (!root) { return; }
			const prd = PrdManager.load(root, getPrdPathSetting());
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
		const prdPattern = prdWatchPattern(workspaceRoot, getPrdPathSetting());
		const prdWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(workspaceRoot, prdPattern)
		);
		prdWatcher.onDidChange(() => { output.appendLine('[Ralph] prd.json changed'); KanbanPanel.refresh(); });
		prdWatcher.onDidCreate(() => { output.appendLine('[Ralph] prd.json created'); KanbanPanel.refresh(); });
		prdWatcher.onDidDelete(() => KanbanPanel.refresh());
		context.subscriptions.push(prdWatcher);
	}

	output.appendLine('[Ralph] commands and watchers registered.');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
	return resolveWorkspaceRoot(
		vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath),
		getPrdPathSetting(),
	);
}

function getPrdPathSetting(): string {
	return vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', DEFAULT_PRD_PATH) ?? DEFAULT_PRD_PATH;
}
