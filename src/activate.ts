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
import { getTaskRunBlockReason, pendingTasksMessage, runTaskWithRetry } from './commands/task';
import { optimizeMemory } from './commands/memory';
import { buildPrompt } from './promptBuilders';
import { resolveWorkspaceRoot } from './workspaceRoot';
import { requireWorkspaceTrust } from './workspaceTrust';
import { listRalphFolders } from './workspaceFolders';
import { buildAnalyzeExistingProjectPrompt } from './kanban/analyzeProject';
import { sendToChat } from './chatLauncher';
import { syncIssue } from './commands/syncIssue';

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
			if (!requireWorkspaceTrust('abrir el tablero')) { return; }
			output.appendLine('[Ralph] openKanban triggered');
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			KanbanPanel.createOrShow(context.extensionUri, root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.startRunner', () => {
			if (!requireWorkspaceTrust('iniciar el runner')) { return; }
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			KanbanPanel.createOrShow(context.extensionUri, root, output);
			KanbanPanel.sendMessage('startRunner');
		}),

		vscode.commands.registerCommand('ralph-suite.stopRunner', () => {
			if (!requireWorkspaceTrust('detener el runner')) { return; }
			if (!KanbanPanel.sendMessage('stopRunner')) {
				vscode.window.showErrorMessage('Ralph: no hay un tablero abierto para detener.');
			}
		}),

		vscode.commands.registerCommand('ralph-suite.setupProject', () => {
			if (!requireWorkspaceTrust('configurar el proyecto')) { return; }
			output.appendLine('[Ralph] setupProject triggered');
			setupProject(output);
		}),

		vscode.commands.registerCommand('ralph-suite.analyzeProject', async () => {
			if (!requireWorkspaceTrust('analizar el proyecto')) { return; }
			output.appendLine('[Ralph] analyzeProject triggered');
			const folders = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), getPrdPathSetting());
			if (!folders.length) { vscode.window.showErrorMessage('No workspace open.'); return; }
			const prompt = buildAnalyzeExistingProjectPrompt(folders.map(folder => folder.root));
			await sendToChat(prompt, { fallbackMessage: 'Analyze prompt copied — paste in Chat.' });
		}),

		vscode.commands.registerCommand('ralph-suite.initProject', () => {
			if (!requireWorkspaceTrust('inicializar el proyecto')) { return; }
			output.appendLine('[Ralph] initProject triggered');
			const root = getWorkspaceRoot();
			if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
			initProject(root, output);
		}),

		vscode.commands.registerCommand('ralph-suite.optimizeMemory', async () => {
			if (!requireWorkspaceTrust('optimizar la memoria')) { return; }
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

		vscode.commands.registerCommand('ralph-suite.runTask', async (taskId?: string, workspaceRoot?: string) => {
			if (!requireWorkspaceTrust('ejecutar una tarea')) { return; }
			output.appendLine(`[Ralph] runTask triggered: ${taskId ?? 'auto'}`);
			const allowed = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), getPrdPathSetting()).map(folder => folder.root);
			const root = resolveCommandWorkspaceRoot(workspaceRoot, allowed);
			if (!root) { return; }
			const prd = PrdManager.load(root, getPrdPathSetting());
			if (!prd) { vscode.window.showErrorMessage('No prd.json found.'); return; }
			const task = taskId
				? prd.issues.find(i => i.id === taskId)
				: PrdManager.nextPending(prd, root);
			if (!task) {
				vscode.window.showInformationMessage(pendingTasksMessage(prd.issues, 'No hay tareas pendientes.'));
				return;
			}
			const runtimeStatuses = RalphStateManager.getAllStatuses(root);
			const prdStatuses = Object.fromEntries(prd.issues.map(issue => [issue.id, issue.status]));
			if (taskId) {
				const reason = getTaskRunBlockReason(task, runtimeStatuses, prdStatuses);
				if (reason) { vscode.window.showErrorMessage(`Ralph: ${reason}`); return; }
			}
			const cfg          = vscode.workspace.getConfiguration('ralph-suite');
			const prompt       = buildPrompt(task, prd, {
				kind: 'ralph-execution',
				localTaskId: task.id,
				workspaceRoot: root,
			});
			const freshContext = cfg.get<boolean>('freshContext', true);
			const minWaitMs    = cfg.get<number>('minWaitMs', 15000);
			const timeoutMs    = cfg.get<number>('taskTimeoutMs', 600000);
			const retries      = cfg.get<number>('taskRetries', 1);
			await runTaskWithRetry(task, prompt, root, freshContext, minWaitMs, timeoutMs, retries, output, KanbanPanel.runnerSignal());
		}),

		vscode.commands.registerCommand('ralph-suite.syncIssue', (githubIssueNumber: unknown, status: unknown, workspaceRoot?: string) => {
			if (!requireWorkspaceTrust('sincronizar una issue')) { return; }
			const execute = (resolvedIssueNumber: unknown, resolvedStatus: unknown) => {
				const allowed = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), getPrdPathSetting()).map(folder => folder.root);
				const root = resolveCommandWorkspaceRoot(workspaceRoot, allowed);
				syncIssue(resolvedIssueNumber, resolvedStatus, root, getPrdPathSetting());
			};
			if (githubIssueNumber !== undefined && status !== undefined) {
				execute(githubIssueNumber, status);
				return;
			}
			return (async () => {
				if (githubIssueNumber === undefined) {
					const input = await vscode.window.showInputBox({
						prompt: 'GitHub issue number',
						placeHolder: '1-999999',
						validateInput: value => {
							const number = Number(value);
							return Number.isInteger(number) && number >= 1 && number <= 999999
								? undefined
								: 'Enter an integer between 1 and 999999.';
						},
					});
					if (input === undefined) { return; }
					githubIssueNumber = Number(input);
				}
				if (status === undefined) {
					const pickedStatus = await vscode.window.showQuickPick(
						['todo', 'inprogress', 'blocked', 'completed'],
						{ placeHolder: 'Ralph status' },
					);
					if (pickedStatus === undefined) { return; }
					status = pickedStatus;
				}
				execute(githubIssueNumber, status);
			})();
		}),

		vscode.commands.registerCommand('ralph-suite.markDone', async (taskId: string) => {
			if (!requireWorkspaceTrust('marcar una tarea como completada')) { return; }
			const root = getWorkspaceRoot();
			if (!root) { return; }
			const configuredMemoriesPath = vscode.workspace.getConfiguration('ralph-suite').get<string>('memoriesPath', '.agent/memories.md');
			RalphStateManager.setCompleted(root, taskId, undefined, undefined, configuredMemoriesPath);
			KanbanPanel.refresh();
		}),

		vscode.commands.registerCommand('ralph-suite.resetTask', async (taskId: string) => {
			if (!requireWorkspaceTrust('reiniciar una tarea')) { return; }
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

function resolveCommandWorkspaceRoot(workspaceRoot: string | undefined, allowed: string[]): string | undefined {
	if (workspaceRoot !== undefined) {
		if (!allowed.includes(workspaceRoot)) {
			throw new Error(`Ralph: raíz de workspace no permitida: ${workspaceRoot}`);
		}
		return workspaceRoot;
	}
	return getWorkspaceRoot();
}
