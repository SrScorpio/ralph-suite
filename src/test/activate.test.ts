import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { _doActivate } from '../activate';
import { KanbanPanel } from '../kanbanPanel';
import * as projectCommands from '../commands/project';
import * as taskCommands from '../commands/task';
import * as memoryCommands from '../commands/memory';
import { RalphStateManager } from '../stateManager';
import * as fs from 'fs';

function output() {
	return { appendLine: () => undefined, show: () => undefined } as any;
}

function context() {
	return { subscriptions: [] } as any;
}

function captureCommands() {
	const handlers = new Map<string, (...args: any[]) => any>();
	const registerCommand = vscode.commands.registerCommand;
	(vscode.commands as any).registerCommand = (id: string, handler: (...args: any[]) => any) => {
		handlers.set(id, handler);
		return { dispose: () => undefined };
	};
	return { handlers, restore: () => { (vscode.commands as any).registerCommand = registerCommand; } };
}

describe('activation command guards', () => {
	it('uses the dedicated Windows-safe test runner script', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		assert.strictEqual(packageJson.scripts.test, 'node scripts/run-tests.js');
		assert.ok(fs.existsSync(path.join(__dirname, '../../scripts/run-tests.js')));
	});

	it('anuncia el comando público syncIssue', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		assert.ok(packageJson.contributes.commands.some((command: { command: string; title: string }) =>
			command.command === 'ralph-suite.syncIssue'
			&& command.title === '%command.syncIssue.title%'
		));
	});

	it('does not execute mutating commands in an untrusted workspace', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const original = {
			createOrShow: KanbanPanel.createOrShow,
			sendMessage: KanbanPanel.sendMessage,
			setupProject: projectCommands.setupProject,
			initProject: projectCommands.initProject,
			optimizeMemory: memoryCommands.optimizeMemory,
			runTaskWithRetry: taskCommands.runTaskWithRetry,
			setCompleted: RalphStateManager.setCompleted,
			reset: RalphStateManager.reset,
		};
		const capture = captureCommands();
		let mutations = 0;
		(vscode.workspace as any).isTrusted = false;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: path.join(os.tmpdir(), 'ralph-untrusted') } }];
		(KanbanPanel as any).createOrShow = () => { mutations++; };
		(KanbanPanel as any).sendMessage = () => { mutations++; return true; };
		(projectCommands as any).setupProject = () => { mutations++; };
		(projectCommands as any).initProject = () => { mutations++; };
		(memoryCommands as any).optimizeMemory = () => { mutations++; };
		(taskCommands as any).runTaskWithRetry = () => { mutations++; };
		(RalphStateManager as any).setCompleted = () => { mutations++; };
		(RalphStateManager as any).reset = () => { mutations++; };
		try {
			_doActivate(context(), output());
			for (const command of [
				'ralph-suite.openKanban', 'ralph-suite.startRunner', 'ralph-suite.stopRunner',
				'ralph-suite.setupProject', 'ralph-suite.initProject', 'ralph-suite.analyzeProject', 'ralph-suite.optimizeMemory',
				'ralph-suite.runTask', 'ralph-suite.markDone', 'ralph-suite.resetTask', 'ralph-suite.syncIssue',
			]) {
				await capture.handlers.get(command)?.('TASK', 'completed');
			}
			assert.strictEqual(mutations, 0);
		} finally {
			capture.restore();
			(KanbanPanel as any).createOrShow = original.createOrShow;
			(KanbanPanel as any).sendMessage = original.sendMessage;
			(projectCommands as any).setupProject = original.setupProject;
			(projectCommands as any).initProject = original.initProject;
			(memoryCommands as any).optimizeMemory = original.optimizeMemory;
			(taskCommands as any).runTaskWithRetry = original.runTaskWithRetry;
			(RalphStateManager as any).setCompleted = original.setCompleted;
			(RalphStateManager as any).reset = original.reset;
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('mapea una etiqueta github explícita al ID local y escribe completed', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-FOO', title: 'Mapped', labels: ['github:#12'] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.syncIssue')?.(12, 'completed');
			assert.strictEqual(fs.readFileSync(RalphStateManager.statusPath(root, 'ISSUE-FOO'), 'utf8'), 'completed');
			assert.strictEqual(fs.readFileSync(path.join(root, 'docs', 'ralph', 'prd.json'), 'utf8'), JSON.stringify({
				issues: [{ id: 'ISSUE-FOO', title: 'Mapped', labels: ['github:#12'] }],
			}));
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('cancela syncIssue sin argumentos sin escribir estado', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const previousShowInputBox = (vscode.window as any).showInputBox;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-prompt-cancel-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-PROMPT', title: 'Prompt', labels: ['github:#12'] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		(vscode.window as any).showInputBox = async () => undefined;
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.syncIssue')?.();
			assert.strictEqual(fs.existsSync(RalphStateManager.statusPath(root, 'ISSUE-PROMPT')), false);
		} finally {
			capture.restore();
			(vscode.window as any).showInputBox = previousShowInputBox;
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('pide issue y estado cuando syncIssue se lanza sin argumentos', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const previousShowInputBox = (vscode.window as any).showInputBox;
		const previousShowQuickPick = (vscode.window as any).showQuickPick;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-prompt-complete-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-PROMPT', title: 'Prompt', labels: ['github:#12'] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		(vscode.window as any).showInputBox = async () => '12';
		(vscode.window as any).showQuickPick = async () => 'completed';
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.syncIssue')?.();
			assert.strictEqual(fs.readFileSync(RalphStateManager.statusPath(root, 'ISSUE-PROMPT'), 'utf8'), 'completed');
		} finally {
			capture.restore();
			(vscode.window as any).showInputBox = previousShowInputBox;
			(vscode.window as any).showQuickPick = previousShowQuickPick;
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('no muestra prompts cuando syncIssue recibe argumentos de Alfred', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const previousShowInputBox = (vscode.window as any).showInputBox;
		const previousShowQuickPick = (vscode.window as any).showQuickPick;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-no-prompt-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-ALFRED', title: 'Alfred', labels: ['github:#12'] }],
		}));
		const capture = captureCommands();
		let inputCalls = 0;
		let quickPickCalls = 0;
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		(vscode.window as any).showInputBox = async () => { inputCalls++; return '12'; };
		(vscode.window as any).showQuickPick = async () => { quickPickCalls++; return 'completed'; };
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.syncIssue')?.(12, 'completed');
			assert.strictEqual(inputCalls, 0);
			assert.strictEqual(quickPickCalls, 0);
		} finally {
			capture.restore();
			(vscode.window as any).showInputBox = previousShowInputBox;
			(vscode.window as any).showQuickPick = previousShowQuickPick;
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('mapea owner/repo#N de forma única y escribe completed', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-owner-repo-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-OWNER-REPO', title: 'Mapped', labels: ['owner/repo#42'] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.syncIssue')?.(42, 'completed');
			assert.strictEqual(fs.readFileSync(RalphStateManager.statusPath(root, 'ISSUE-OWNER-REPO'), 'utf8'), 'completed');
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('escribe el contenido correcto en cada transición de estado', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-transitions-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-TRANSITIONS', title: 'Transitions', labels: ['owner/repo#43'] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		const statusPath = RalphStateManager.statusPath(root, 'ISSUE-TRANSITIONS');
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.syncIssue')?.(43, 'inprogress');
			assert.strictEqual(fs.readFileSync(statusPath, 'utf8'), 'inprogress');
			await capture.handlers.get('ralph-suite.syncIssue')?.(43, 'blocked');
			assert.strictEqual(fs.readFileSync(statusPath, 'utf8'), 'blocked');
			await capture.handlers.get('ralph-suite.syncIssue')?.(43, 'todo');
			assert.strictEqual(fs.existsSync(statusPath), false);
			assert.strictEqual(RalphStateManager.getStatus(root, 'ISSUE-TRANSITIONS'), 'todo');
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('rechaza una issue sin etiqueta github y no escribe estado', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-unmapped-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-FOO', title: 'Unmapped', labels: [] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		try {
			_doActivate(context(), output());
			assert.throws(() => capture.handlers.get('ralph-suite.syncIssue')?.(12, 'todo'), /No se encontró una tarea Ralph mapeada/);
			assert.strictEqual(fs.existsSync(RalphStateManager.statusPath(root, 'ISSUE-FOO')), false);
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('rechaza mapeos github duplicados', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-duplicate-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [
				{ id: 'ISSUE-FOO', title: 'First', labels: ['owner/repo#12'] },
				{ id: 'ISSUE-BAR', title: 'Second', labels: ['owner/repo#12'] },
			],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		try {
			_doActivate(context(), output());
			assert.throws(() => capture.handlers.get('ralph-suite.syncIssue')?.(12, 'completed'), /el mapeo debe ser único/);
			assert.strictEqual(fs.existsSync(RalphStateManager.statusPath(root, 'ISSUE-FOO')), false);
			assert.strictEqual(fs.existsSync(RalphStateManager.statusPath(root, 'ISSUE-BAR')), false);
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('rechaza una raíz explícita no allowlisted sin escribir en la raíz predeterminada', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const defaultRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-default-'));
		const requestedRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-requested-'));
		await fs.promises.mkdir(path.join(defaultRoot, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(defaultRoot, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-FOO', title: 'Default task', labels: ['owner/repo#12'] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: defaultRoot } }];
		try {
			_doActivate(context(), output());
			assert.throws(
				() => capture.handlers.get('ralph-suite.syncIssue')?.(12, 'completed', requestedRoot),
				/raíz de workspace no permitida/
			);
			assert.strictEqual(fs.existsSync(RalphStateManager.statusPath(defaultRoot, 'ISSUE-FOO')), false);
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('no infiere ISSUE-012 y rechaza estados inválidos', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-sync-id-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({
			issues: [{ id: 'ISSUE-012', title: 'Numeric only', labels: [] }],
		}));
		const capture = captureCommands();
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		try {
			_doActivate(context(), output());
			assert.throws(() => capture.handlers.get('ralph-suite.syncIssue')?.(12, 'todo'), /No se encontró una tarea Ralph mapeada/);
			assert.throws(() => capture.handlers.get('ralph-suite.syncIssue')?.(12, 'invalid'), /Estado Ralph inválido/);
		} finally {
			capture.restore();
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('creates the board before sending startRunner when trusted', async () => {
		const previousTrusted = (vscode.workspace as any).isTrusted;
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const originalCreateOrShow = KanbanPanel.createOrShow;
		const originalSendMessage = KanbanPanel.sendMessage;
		const capture = captureCommands();
		const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ralph-trusted-'));
		await fs.promises.mkdir(path.join(root, 'docs', 'ralph'), { recursive: true });
		await fs.promises.writeFile(path.join(root, 'docs', 'ralph', 'prd.json'), JSON.stringify({ issues: [] }));
		const events: string[] = [];
		(vscode.workspace as any).isTrusted = true;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		(KanbanPanel as any).createOrShow = () => { events.push('createOrShow'); };
		(KanbanPanel as any).sendMessage = () => { events.push('sendMessage'); return true; };
		try {
			_doActivate(context(), output());
			await capture.handlers.get('ralph-suite.startRunner')?.();
			assert.deepStrictEqual(events, ['createOrShow', 'sendMessage']);
		} finally {
			capture.restore();
			(KanbanPanel as any).createOrShow = originalCreateOrShow;
			(KanbanPanel as any).sendMessage = originalSendMessage;
			(vscode.workspace as any).isTrusted = previousTrusted;
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});
});