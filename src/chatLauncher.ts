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

export interface ChatOptions {
	/** Start a fresh chat session before sending (clears prior context). */
	freshContext?: boolean;
	/** Small delay after newChat to let the view settle (default 400ms). */
	delayMs?: number;
	/** Custom message shown when falling back to the clipboard. */
	fallbackMessage?: string;
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
	} = options;

	try {
		if (freshContext) {
			await vscode.commands.executeCommand('workbench.action.chat.newChat');
			await sleep(delayMs);
		}
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: prompt,
			isPartialQuery: false,
		});
		return true;
	} catch {
		await vscode.env.clipboard.writeText(prompt);
		vscode.window.showInformationMessage(fallbackMessage);
		return false;
	}
}
