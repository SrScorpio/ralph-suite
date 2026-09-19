/**
 * task.ts — Runner de tareas: ejecución, reintentos y polling
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import { RalphStateManager } from '../stateManager';
import { KanbanPanel } from '../kanbanPanel';
import { sendToChat } from '../chatLauncher';

// ── Sleep utility ────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

export function getTaskRunBlockReason(
	task: { id: string; status: string; dependencies?: string[] },
	runtimeStatuses: Record<string, string>,
	prdStatuses: Record<string, string>,
): string | null {
	if (task.status !== 'todo') {
		return `Task ${task.id} cannot run because its status is ${task.status}.`;
	}
	const dependency = (task.dependencies ?? []).find(id =>
		runtimeStatuses[id] !== 'completed' && prdStatuses[id] !== 'completed'
	);
	return dependency
		? `Task ${task.id} is blocked: dependency ${dependency} is not completed.`
		: null;
}

export function pendingTasksMessage(
	issues: readonly { status: string }[],
	emptyMessage: string,
	blockedMessage = 'No hay tareas todo elegibles; quedan tareas bloqueadas o fallidas.',
): string {
	return issues.some(issue => issue.status === 'blocked' || issue.status === 'failed')
		? blockedMessage
		: emptyMessage;
}

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<boolean> {
	return new Promise(resolve => {
		if (signal?.aborted) { resolve(false); return; }
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve(true);
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			resolve(false);
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

// ── Task runner with retries ─────────────────────────────────────────────────

export async function runTaskWithRetry(
	task: any, prompt: string, root: string,
	freshContext: boolean, minWaitMs: number, timeoutMs: number,
	retries: number, output: vscode.OutputChannel, signal?: AbortSignal
): Promise<void> {
	const pollMs = vscode.workspace.getConfiguration('ralph-suite').get<number>('pollIntervalMs', 5000);

	for (let attempt = 1; attempt <= retries + 1; attempt++) {
		if (signal?.aborted) { return; }
		if (attempt > 1) {
			output.appendLine(`[Ralph] Retry ${attempt}/${retries + 1} for ${task.id}`);
		}
		try {
			const sent = await sendToChat(prompt, {
				freshContext,
				fallbackMessage: 'Prompt copied — paste in Chat.',
				timeoutMs: Math.min(timeoutMs, 10000),
				signal,
			});
			if (!sent) {
				vscode.window.showWarningMessage(`Ralph: no se pudo abrir Chat para ${task.id}. La tarea no se ha iniciado.`);
				return;
			}
		} catch {
			// sendToChat already handles the clipboard fallback
			return;
		}
		if (signal?.aborted) { return; }

		RalphStateManager.setInProgress(root, task.id, task.title);
		KanbanPanel.refresh();
		output.appendLine(`[Ralph] Task ${task.id} started — waiting ${minWaitMs / 1000}s`);
		if (!await waitWithAbort(minWaitMs, signal)) { return; }

		const startedAt = Date.now();
		let completed = false;
		while (Date.now() - startedAt < timeoutMs - minWaitMs) {
			if (RalphStateManager.getStatus(root, task.id) === 'completed') {
				completed = true;
				output.appendLine(`[Ralph] ✓ ${task.id} completed`);
				break;
			}
			if (!await waitWithAbort(pollMs, signal)) { return; }
		}
		if (completed) { return; }
		if (signal?.aborted) { return; }

		output.appendLine(`[Ralph] ⚠ ${task.id} timed out`);
		if (attempt <= retries) {
			RalphStateManager.reset(root, task.id);
			KanbanPanel.refresh();
		} else {
			RalphStateManager.setFailed(root, task.id, `Timed out after ${retries + 1} attempts`);
			KanbanPanel.refresh();
			vscode.window.showWarningMessage(`Ralph: ${task.id} timed out`, 'Open Output')
				.then(a => { if (a === 'Open Output') { output.show(); } });
		}
	}
}
