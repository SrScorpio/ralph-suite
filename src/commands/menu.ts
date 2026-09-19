/**
 * menu.ts — Comando showMenu (quick pick)
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import { KanbanPanel } from '../kanbanPanel';
import { DEFAULT_PRD_PATH, PrdManager } from '../prdManager';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import { detectLocale, t } from '../i18n';

interface MenuQuickPickItem extends vscode.QuickPickItem {
	id: string;
}

export async function showMenu(output: vscode.OutputChannel): Promise<void> {
	const root = getWorkspaceRoot();
	const prdPathSetting = vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', DEFAULT_PRD_PATH) ?? DEFAULT_PRD_PATH;
	const prd  = root ? PrdManager.load(root, prdPathSetting) : null;
	const done  = prd ? prd.issues.filter((i: any) => i.status === 'completed').length : 0;
	const total = prd ? prd.issues.length : 0;
	const pct   = total ? Math.round((done / total) * 100) : 0;
	const strings = t(detectLocale());

	const items: MenuQuickPickItem[] = [
		{ id: 'openBoard', label: `$(layout-panel)  ${strings.menuOpenBoard}`, description: prd ? `${prd.project} — ${done}/${total} (${pct}%)` : strings.menuNoPrd },
		{ id: 'autoRun', label: `$(zap)  ${strings.menuAutoRun}`, description: strings.menuDescAutoRun },
		{ id: 'stopRunner', label: `$(debug-stop)  ${strings.menuStopRunner}`, description: strings.menuDescStopRunner },
		{ id: 'runNext', label: `$(play)  ${strings.menuRunNext}`, description: strings.menuDescRunNext },
		{ id: 'addIssue', label: `$(add)  ${strings.menuAddIssue}`, description: strings.menuDescAddIssue },
		{ id: 'openPrd', label: `$(file)  ${strings.menuOpenPrd}`, description: strings.menuDescOpenPrd },
		{ id: 'memories', label: `$(book)  ${strings.menuMemories}`, description: strings.menuDescMemories },
		{ id: 'optimize', label: `$(sparkle)  ${strings.menuOptimize}`, description: strings.menuDescOptimize },
		{ id: 'setup', label: `$(tools)  ${strings.menuSetup}`, description: strings.menuDescSetup },
		{ id: 'initProject', label: `$(new-file)  ${strings.menuInitProject}`, description: strings.menuDescInitProject },
		{ id: 'analyze', label: `$(search)  ${strings.menuAnalyze}`, description: strings.menuDescAnalyze },
		{ id: 'syncIssue', label: `$(cloud-download)  ${strings.menuSyncIssue}`, description: strings.menuDescSyncIssue },
		{ id: 'settings', label: `$(gear)  ${strings.menuSettings}`, description: strings.menuDescSettings },
	];

	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: strings.menuPlaceholder,
		matchOnDescription: true,
	});
	if (!pick) { return; }

	const boardActions: Record<string, string> = {
		addIssue: 'showAddIssue',
		openPrd: 'openPrd',
		memories: 'openMemories',
	};
	const boardAction = boardActions[pick.id];
	if (boardAction) {
		vscode.commands.executeCommand('ralph-suite.openKanban');
		setTimeout(() => KanbanPanel.sendMessage(boardAction), 500);
		return;
	}

	const directCmds: Record<string, string> = {
		openBoard: 'ralph-suite.openKanban',
		autoRun: 'ralph-suite.startRunner',
		stopRunner: 'ralph-suite.stopRunner',
		runNext: 'ralph-suite.runTask',
		optimize: 'ralph-suite.optimizeMemory',
		setup: 'ralph-suite.setupProject',
		initProject: 'ralph-suite.initProject',
		analyze: 'ralph-suite.analyzeProject',
		syncIssue: 'ralph-suite.syncIssue',
		settings: 'ralph-suite.openSettings',
	};
	if (directCmds[pick.id]) {
		vscode.commands.executeCommand(directCmds[pick.id]);
	}
}

function getWorkspaceRoot(): string | undefined {
	const prdPathSetting = vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', DEFAULT_PRD_PATH) ?? DEFAULT_PRD_PATH;
	return resolveWorkspaceRoot(
		vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath),
		prdPathSetting,
	);
}
