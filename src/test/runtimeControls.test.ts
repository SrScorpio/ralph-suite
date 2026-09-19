import * as assert from 'assert';
import * as vscode from 'vscode';
import { getTaskRunBlockReason, pendingTasksMessage, runTaskWithRetry } from '../commands/task';
import { shouldCompleteTask } from '../kanbanPanel';
import { requireWorkspaceTrust } from '../workspaceTrust';
import { RalphStateManager } from '../stateManager';
import { KanbanPanel } from '../kanbanPanel';

describe('Ralph runtime controls', () => {
	it('blocks every non-todo task status', () => {
		for (const status of ['blocked', 'completed', 'inprogress', 'failed']) {
			assert.ok(getTaskRunBlockReason({ id: 'TASK', status, dependencies: [] }, {}, {}));
		}
		assert.strictEqual(getTaskRunBlockReason({ id: 'TASK', status: 'todo', dependencies: [] }, {}, {}), null);
	});

	it('accepts dependencies completed by runtime or PRD status', () => {
		const task = { id: 'TASK', status: 'todo', dependencies: ['DEP'] };
		assert.strictEqual(getTaskRunBlockReason(task, { DEP: 'completed' }, {}), null);
		assert.strictEqual(getTaskRunBlockReason(task, {}, { DEP: 'completed' }), null);
		assert.ok(getTaskRunBlockReason(task, {}, { DEP: 'todo' }));
	});

	it('uses the blocked or failed message when no todo task is eligible', () => {
		assert.strictEqual(
			pendingTasksMessage([{ status: 'blocked' }], 'No hay tareas pendientes.'),
			'No hay tareas todo elegibles; quedan tareas bloqueadas o fallidas.',
		);
		assert.strictEqual(
			pendingTasksMessage([{ status: 'todo' }], 'No hay tareas pendientes.'),
			'No hay tareas pendientes.',
		);
	});

	it('completes only after input confirmation, including an empty string', () => {
		assert.strictEqual(shouldCompleteTask(undefined), false);
		assert.strictEqual(shouldCompleteTask(''), true);
	});

	it('does not mark a task in progress when chat fallback returns false', async () => {
		const root = require('os').tmpdir();
		const task = { id: `Ralph-send-false-${Date.now()}`, title: 'Task' };
		const executeCommand = vscode.commands.executeCommand;
		(vscode.commands as any).executeCommand = async () => { throw new Error('chat unavailable'); };
		try {
			await runTaskWithRetry(task, 'prompt', root, false, 0, 100, 1, { appendLine: () => undefined } as any);
			assert.strictEqual(RalphStateManager.getStatus(root, task.id), 'todo');
		} finally {
			(vscode.commands as any).executeCommand = executeCommand;
		}
	});

	it('stops without failing or retrying after abort', async () => {
		const root = require('os').tmpdir();
		const task = { id: `Ralph-abort-${Date.now()}`, title: 'Task' };
		const controller = new AbortController();
		const executeCommand = vscode.commands.executeCommand;
		let opens = 0;
		(vscode.commands as any).executeCommand = async (command: string) => {
			if (command === 'workbench.action.chat.open') {
				opens++;
				setTimeout(() => controller.abort(), 5);
			}
		};
		try {
			await runTaskWithRetry(task, 'prompt', root, false, 50, 100, 1, { appendLine: () => undefined } as any, controller.signal);
			assert.strictEqual(opens, 1);
			assert.notStrictEqual(RalphStateManager.getStatus(root, task.id), 'failed');
		} finally {
			(vscode.commands as any).executeCommand = executeCommand;
		}
	});

	it('does not mark a task in progress when abort happens during sendToChat', async () => {
		const root = require('os').tmpdir();
		const task = { id: `Ralph-abort-send-${Date.now()}`, title: 'Task' };
		const controller = new AbortController();
		const executeCommand = vscode.commands.executeCommand;
		(vscode.commands as any).executeCommand = async (command: string) => {
			if (command === 'workbench.action.chat.open') {
				await new Promise<void>(resolve => {
					controller.signal.addEventListener('abort', () => resolve(), { once: true });
					setTimeout(() => controller.abort(), 5);
				});
			}
		};
		try {
			await runTaskWithRetry(task, 'prompt', root, false, 0, 100, 1, { appendLine: () => undefined } as any, controller.signal);
			assert.strictEqual(RalphStateManager.getStatus(root, task.id), 'todo');
		} finally {
			(vscode.commands as any).executeCommand = executeCommand;
		}
	});

	it('does not mark a task in progress when sendToChat times out', async () => {
		const root = require('os').tmpdir();
		const task = { id: `Ralph-timeout-send-${Date.now()}`, title: 'Task' };
		const executeCommand = vscode.commands.executeCommand;
		let opens = 0;
		(vscode.commands as any).executeCommand = async (command: string) => {
			if (command === 'workbench.action.chat.open') {
				opens++;
				return new Promise<void>(() => undefined);
			}
		};
		try {
			await runTaskWithRetry(task, 'prompt', root, false, 0, 20, 1, { appendLine: () => undefined } as any);
			assert.strictEqual(opens, 1);
			assert.strictEqual(RalphStateManager.getStatus(root, task.id), 'todo');
		} finally {
			(vscode.commands as any).executeCommand = executeCommand;
		}
	});

	it('rejects untrusted workspaces with a clear error', () => {
		const previous = (vscode.workspace as any).isTrusted;
		(vscode.workspace as any).isTrusted = false;
		try {
			assert.strictEqual(requireWorkspaceTrust('runTask'), false);
		} finally {
			(vscode.workspace as any).isTrusted = previous;
		}
	});

	it('keeps folder-scoped messages on the panel root', () => {
		const first = { index: 0, root: '/workspace/first', name: 'first', prdPath: '', hasPrd: false };
		const second = { index: 1, root: '/workspace/second', name: 'second', prdPath: '', hasPrd: false };
		const panel = Object.create(KanbanPanel.prototype) as any;
		panel.root = first.root;
		panel.folders = [first, second];
		panel.boardScope = 'folder';

		assert.strictEqual(panel.folderFromMessage({ folderIndex: 1 }).root, first.root);
	});
});