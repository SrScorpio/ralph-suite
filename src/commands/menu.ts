/**
 * menu.ts — Comando showMenu (quick pick)
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import { KanbanPanel } from '../kanbanPanel';
import { PrdManager } from '../prdManager';

export async function showMenu(output: vscode.OutputChannel): Promise<void> {
	const root = getWorkspaceRoot();
	const prdPathSetting = vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', 'prd.json');
	const prd  = root ? PrdManager.load(root, prdPathSetting) : null;
	const done  = prd ? prd.issues.filter((i: any) => i.status === 'completed').length : 0;
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
		{ label: '$(sparkle)  Optimize Memory',   description: 'Compress and deduplicate memories.md' },
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
		'$(sparkle)  Optimize Memory': 'ralph-suite.optimizeMemory',
		'$(tools)  Setup Project':     'ralph-suite.setupProject',
		'$(gear)  Settings':           'ralph-suite.openSettings',
	};
	if (directCmds[pick.label]) {
		vscode.commands.executeCommand(directCmds[pick.label]);
	}
}

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
