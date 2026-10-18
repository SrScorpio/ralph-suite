/**
 * chatLauncher.ts — Centralized helper for sending prompts to the VS Code Chat.
 *
 * VS Code exposes no public stable API to programmatically submit a prompt to
 * the user's Chat view. The `workbench.action.chat.open` command (with
 * `{ query, isPartialQuery }`) is an internal command, but it is the same
 * mechanism that VS Code core and the Copilot extension itself use (verified
 * in microsoft/vscode source, 2026). It accepts `isPartialQuery: false` to
 * submit immediately or `true` to place text in the input for editing.
 *
 * This helper centralizes that invocation so that:
 *   - If the command id or args change in the future, only this file is updated.
 *   - Every call site consistently falls back to the clipboard.
 *   - The `newChat` + `open` sequence is reusable.
 */

import * as vscode from 'vscode';
import { sleep } from './commands/task';

interface ChatOptions {
	/** Start a fresh chat session before sending (clears prior context). */
	freshContext?: boolean;
	/** Small delay after newChat to let the view settle (default 400ms). */
	delayMs?: number;
	/** Custom message shown when falling back to the clipboard. */
	fallbackMessage?: string;
	/** Abort the command if Chat does not respond in time. */
	timeoutMs?: number;
	/** Stop waiting when the runner is stopped. */
	signal?: AbortSignal;
	/**
	 * Subagente de Alfred al que va el prompt (`junior-dev`, `alfred`…).
	 * Se envía como mención y, si el chat lo admite, como participante.
	 * Sin valor, el prompt cae en el chat que esté activo.
	 */
	agent?: string;
}

/**
 * Send a prompt to the VS Code Chat view.
 *
 * Tries the internal chat command first; on any failure, copies the prompt to
 * the clipboard and notifies the user so they can paste it manually.
 *
 * @returns `true` if the chat command succeeded, `false` if it fell back.
 */
export async function sendToChat(prompt: string, options: ChatOptions = {}): Promise<boolean> {
	const {
		freshContext = false,
		delayMs = 400,
		fallbackMessage = 'Prompt copied — paste in Chat.',
		timeoutMs = 10000,
		signal,
		agent,
	} = options;
	const agentName = typeof agent === 'string' && /^[a-z0-9-]{1,40}$/.test(agent) ? agent : undefined;
	const addressed = agentName && !prompt.startsWith(`@${agentName}`) ? `@${agentName}\n${prompt}` : prompt;
	let abortListener: (() => void) | undefined;

	try {
		if (signal?.aborted) { throw new Error('Chat command aborted'); }
		const send = (async () => {
			if (freshContext) {
				await vscode.commands.executeCommand('workbench.action.chat.newChat');
				await sleep(delayMs);
			}
			if (signal?.aborted) { throw new Error('Chat command aborted'); }
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: addressed,
				isPartialQuery: false,
				...(agentName ? { agent: agentName } : {}),
			});
		})();
		const timeout = new Promise<never>((_, reject) => {
			const timer = setTimeout(() => reject(new Error('Chat command timed out')), timeoutMs);
			send.finally(() => clearTimeout(timer)).catch(() => undefined);
		});
		const aborted = signal
			? new Promise<never>((_, reject) => {
				if (signal.aborted) { reject(new Error('Chat command aborted')); return; }
				abortListener = () => reject(new Error('Chat command aborted'));
				signal.addEventListener('abort', abortListener, { once: true });
			})
			: new Promise<never>(() => undefined);
		await Promise.race([send, timeout, aborted]);
		// Promise.race cannot cancel VS Code's command. A late completion is
		// intentionally ignored because state changes happen only after true.
		return true;
	} catch {
		await vscode.env.clipboard.writeText(addressed);
		vscode.window.showInformationMessage(fallbackMessage);
		return false;
	} finally {
		if (signal && abortListener) {
			signal.removeEventListener('abort', abortListener);
		}
	}
}
