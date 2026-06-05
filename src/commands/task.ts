/**
 * task.ts — Runner de tareas: ejecución, reintentos y polling
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import { RalphStateManager } from '../stateManager';
import { KanbanPanel } from '../kanbanPanel';

// ── Sleep utility ────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

// ── Task runner with retries ─────────────────────────────────────────────────

export async function runTaskWithRetry(
	task: any, prompt: string, root: string,
	freshContext: boolean, minWaitMs: number, timeoutMs: number,
	retries: number, output: vscode.OutputChannel
): Promise<void> {
	const pollMs = vscode.workspace.getConfiguration('ralph-suite').get<number>('pollIntervalMs', 5000);

	for (let attempt = 1; attempt <= retries + 1; attempt++) {
		if (attempt > 1) {
			output.appendLine(`[Ralph] Retry ${attempt}/${retries + 1} for ${task.id}`);
		}
		try {
			if (freshContext) {
				await vscode.commands.executeCommand('workbench.action.chat.newChat');
				await sleep(400);
			}
			await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt, isPartialQuery: false });
		} catch {
			await vscode.env.clipboard.writeText(prompt);
			vscode.window.showInformationMessage('Prompt copied — paste in Chat.');
			return;
		}

		RalphStateManager.setInProgress(root, task.id, task.title);
		KanbanPanel.refresh();
		output.appendLine(`[Ralph] Task ${task.id} started — waiting ${minWaitMs / 1000}s`);
		await sleep(minWaitMs);

		const startedAt = Date.now();
		let completed = false;
		while (Date.now() - startedAt < timeoutMs - minWaitMs) {
			if (RalphStateManager.getStatus(root, task.id) === 'completed') {
				completed = true;
				output.appendLine(`[Ralph] ✓ ${task.id} completed`);
				break;
			}
			await sleep(pollMs);
		}
		if (completed) { return; }

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
