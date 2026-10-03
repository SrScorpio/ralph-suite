import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { _doActivate } from '../activate';
import { t } from '../i18n';
import {
	backlogItems,
	RALPH_SIDEBAR_VIEW_ID,
	RALPH_VIEW_CONTAINER_ID,
	RalphSidebarProvider,
	sidebarActions,
} from '../sidebarTree';
import type { Issue } from '../prdManager';

function issue(id: string, status: Issue['status']): Issue {
	return {
		id,
		title: id,
		description: '',
		priority: 'P2',
		status,
		acceptanceCriteria: [],
		dependencies: [],
		labels: [],
	};
}

describe('Ralph Suite sidebar', () => {
	it('declara un contenedor propio en la Activity Bar, sin Alfred', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		const containers = packageJson.contributes.viewsContainers.activitybar;
		assert.ok(containers.some((container: { id: string; title: string }) =>
			container.id === RALPH_VIEW_CONTAINER_ID && container.title === 'Ralph Suite'
		));
		const views = packageJson.contributes.views[RALPH_VIEW_CONTAINER_ID];
		assert.ok(views.some((view: { id: string }) => view.id === RALPH_SIDEBAR_VIEW_ID));
		const serialized = JSON.stringify(packageJson.contributes.viewsContainers);
		assert.ok(!serialized.includes('alfred'));
	});

	it('registra la vista y conserva el botón inferior hacia showMenu', () => {
		const registered: string[] = [];
		let statusBar: { text: string; command: string } | undefined;
		const originalRegister = vscode.commands.registerCommand;
		const originalStatus = vscode.window.createStatusBarItem;
		const originalTree = vscode.window.registerTreeDataProvider;
		(vscode.commands as any).registerCommand = (id: string) => {
			registered.push(id);
			return { dispose: () => undefined };
		};
		(vscode.window as any).createStatusBarItem = () => {
			const item = { text: '', command: '', show: () => undefined, dispose: () => undefined };
			statusBar = item;
			return item;
		};
		(vscode.window as any).registerTreeDataProvider = (viewId: string) => {
			registered.push(`view:${viewId}`);
			return { dispose: () => undefined };
		};
		try {
			_doActivate({ subscriptions: [] } as any, { appendLine: () => undefined } as any);
			assert.ok(registered.includes('ralph-suite.showMenu'));
			assert.ok(registered.includes(`view:${RALPH_SIDEBAR_VIEW_ID}`));
			assert.strictEqual(statusBar?.command, 'ralph-suite.showMenu');
			assert.strictEqual(statusBar?.text, '$(layout-panel) Ralph');
		} finally {
			(vscode.commands as any).registerCommand = originalRegister;
			(vscode.window as any).createStatusBarItem = originalStatus;
			(vscode.window as any).registerTreeDataProvider = originalTree;
		}
	});

	it('muestra el estado del backlog y da acceso a tablero, runner y menú', () => {
		const strings = t('es');
		const actions = sidebarActions(strings);
		assert.deepStrictEqual(actions.map(item => item.command?.command), [
			'ralph-suite.openKanban',
			'ralph-suite.runTask',
			'ralph-suite.startRunner',
			'ralph-suite.stopRunner',
			'ralph-suite.showMenu',
		]);

		const provider = new RalphSidebarProvider({
			getWorkspaceRoot: () => 'C:\\work',
			getPrdPath: () => 'docs/ralph/prd.json',
			loadPrd: () => ({
				project: 'demo',
				issues: [issue('ISSUE-001', 'completed'), issue('ISSUE-002', 'todo'), issue('ISSUE-003', 'inprogress')],
			}),
			strings: () => strings,
		});
		const children = provider.getChildren();
		const labels = children.map(item => String(item.label));
		assert.ok(labels.includes('demo'));
		assert.ok(labels.some(label => label.startsWith('1/3')));
		assert.ok(labels.some(label => label.includes('Por hacer: 1')));
		assert.ok(labels.some(label => label.includes('En progreso: 1')));
		assert.ok(labels.some(label => label.includes('Completado: 1')));
		assert.deepStrictEqual(backlogItems({ project: '', issues: [] }, strings).map(item => String(item.label))[0], strings.sidebarBacklog);
	});

	it('sin workspace ni PRD sigue ofreciendo tablero, runner y menú', () => {
		const strings = t('en');
		const empty = new RalphSidebarProvider({
			getWorkspaceRoot: () => undefined,
			strings: () => strings,
		});
		const missing = new RalphSidebarProvider({
			getWorkspaceRoot: () => 'C:\\work',
			loadPrd: () => null,
			strings: () => strings,
		});
		assert.ok(empty.getChildren().some(item => String(item.label) === strings.sidebarNoWorkspace));
		assert.ok(missing.getChildren().some(item => String(item.label) === strings.menuNoPrd));
		for (const children of [empty.getChildren(), missing.getChildren()]) {
			assert.deepStrictEqual(
				children.filter(item => item.command).map(item => item.command?.command),
				['ralph-suite.openKanban', 'ralph-suite.runTask', 'ralph-suite.startRunner', 'ralph-suite.stopRunner', 'ralph-suite.showMenu'],
			);
		}
	});
});
