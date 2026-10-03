/**
 * sidebarTree.ts — Vista de Ralph Suite en la Activity Bar.
 *
 * No depende de Alfred Dev: lee el PRD local y lanza comandos propios
 * de Ralph (tablero, runner, menú). El StatusBarItem de activate.ts
 * sigue abriendo ralph-suite.showMenu.
 */

import * as vscode from 'vscode';
import { detectLocale, t, type UIStrings } from './i18n';
import { DEFAULT_PRD_PATH, PrdManager, type Issue } from './prdManager';
import { resolveWorkspaceRoot } from './workspaceRoot';

export const RALPH_VIEW_CONTAINER_ID = 'ralph-suite-container';
export const RALPH_SIDEBAR_VIEW_ID = 'ralph-suite.sidebar';

const STATUS_ORDER: Issue['status'][] = ['inprogress', 'blocked', 'failed', 'todo', 'completed'];

export class RalphSidebarItem extends vscode.TreeItem {
	constructor(
		label: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
		command?: string,
		icon?: string,
	) {
		super(label, collapsibleState);
		if (command) {
			this.command = { command, title: label };
		}
		if (icon) {
			this.iconPath = new vscode.ThemeIcon(icon);
		}
		this.contextValue = command ? 'ralph-action' : 'ralph-status';
	}
}

export interface RalphSidebarDeps {
	getWorkspaceRoot?: () => string | undefined;
	getPrdPath?: () => string;
	loadPrd?: (root: string, configuredPath: string) => { project: string; issues: Issue[] } | null;
	strings?: () => UIStrings;
}

/**
 * Árbol de estado del backlog más accesos al tablero, al runner y al menú.
 */
export class RalphSidebarProvider implements vscode.TreeDataProvider<RalphSidebarItem> {
	private readonly onDidChange = new vscode.EventEmitter<RalphSidebarItem | undefined | null | void>();
	readonly onDidChangeTreeData = this.onDidChange.event;

	constructor(private readonly deps: RalphSidebarDeps = {}) {}

	refresh(): void {
		this.onDidChange.fire();
	}

	getTreeItem(element: RalphSidebarItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: RalphSidebarItem): RalphSidebarItem[] {
		if (element) { return []; }
		const strings = (this.deps.strings ?? (() => t(detectLocale())))();
		const actions = sidebarActions(strings);
		const root = (this.deps.getWorkspaceRoot ?? defaultWorkspaceRoot)();
		if (!root) {
			return [...actions, new RalphSidebarItem(strings.sidebarNoWorkspace, vscode.TreeItemCollapsibleState.None, undefined, 'info')];
		}
		const configuredPath = (this.deps.getPrdPath ?? defaultPrdPath)();
		const prd = (this.deps.loadPrd ?? ((folder, pathSetting) => PrdManager.load(folder, pathSetting)))(root, configuredPath);
		if (!prd) {
			return [...actions, new RalphSidebarItem(strings.menuNoPrd, vscode.TreeItemCollapsibleState.None, undefined, 'info')];
		}
		return [...actions, ...backlogItems(prd, strings)];
	}
}

/** Acciones que no leen el PRD: tablero, runner y menú. */
export function sidebarActions(strings: UIStrings): RalphSidebarItem[] {
	const none = vscode.TreeItemCollapsibleState.None;
	return [
		new RalphSidebarItem(strings.menuOpenBoard, none, 'ralph-suite.openKanban', 'layout-panel'),
		new RalphSidebarItem(strings.menuRunNext, none, 'ralph-suite.runTask', 'play'),
		new RalphSidebarItem(strings.menuAutoRun, none, 'ralph-suite.startRunner', 'zap'),
		new RalphSidebarItem(strings.menuStopRunner, none, 'ralph-suite.stopRunner', 'debug-stop'),
		new RalphSidebarItem(strings.sidebarOpenMenu, none, 'ralph-suite.showMenu', 'list-selection'),
	];
}

/** Resumen del backlog: proyecto, recuento y una línea por estado presente. */
export function backlogItems(
	prd: { project: string; issues: Issue[] },
	strings: UIStrings,
): RalphSidebarItem[] {
	const none = vscode.TreeItemCollapsibleState.None;
	const counts = new Map<Issue['status'], number>();
	for (const issue of prd.issues) {
		counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
	}
	const done = counts.get('completed') ?? 0;
	const total = prd.issues.length;
	const pct = total ? Math.round((done / total) * 100) : 0;
	const labels: Record<Issue['status'], string> = {
		todo: strings.colTodo,
		inprogress: strings.colInProgress,
		blocked: strings.colBlocked,
		failed: strings.colFailed,
		completed: strings.colDone,
	};
	const icons: Record<Issue['status'], string> = {
		todo: 'circle-outline',
		inprogress: 'play',
		blocked: 'shield',
		failed: 'error',
		completed: 'check',
	};
	const rows = STATUS_ORDER
		.filter(status => counts.has(status))
		.map(status => new RalphSidebarItem(`${labels[status]}: ${counts.get(status)}`, none, undefined, icons[status]));
	return [
		new RalphSidebarItem(prd.project || strings.sidebarBacklog, none, undefined, 'folder'),
		new RalphSidebarItem(strings.sidebarProgress(done, total, pct), none, undefined, 'graph'),
		...rows,
	];
}

function defaultWorkspaceRoot(): string | undefined {
	return resolveWorkspaceRoot(
		vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath),
		defaultPrdPath(),
	);
}

function defaultPrdPath(): string {
	return vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', DEFAULT_PRD_PATH) ?? DEFAULT_PRD_PATH;
}
