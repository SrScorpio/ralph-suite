/**
 * memory.ts — Optimización y auto-optimización de memorias
 *
 * Extraído de extension.ts durante la modularización (ADR-014).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sleep } from './task';

// ── Prompt builder ───────────────────────────────────────────────────────────

export function buildOptimizePrompt(memoriesPath: string, memoriesContent: string): string {
	return `You are helping maintain a project memory file used by AI agents.

The file \`${memoriesPath}\` currently contains:

---
${memoriesContent}
---

Please optimize this file by:
1. **Remove duplicates** — if the same fact, convention, or note appears more than once, keep only the clearest version
2. **Consolidate related entries** — merge similar notes from different task completions into single concise statements
3. **Remove noise** — delete entries that are too vague, obvious, or no longer relevant
4. **Preserve structure** — keep the existing sections (## Project, ## Conventions, ## Known Issues, ## Completed Tasks, etc.)
5. **Keep all unique knowledge** — do not remove facts that are not duplicated, even if brief
6. **Completed Tasks section** — keep only the last 10 entries, summarising older ones into a single "## Earlier completions" paragraph if needed

The result should be significantly shorter than the original but contain all unique knowledge.

Write the optimized content to: \`${memoriesPath}\`

After writing the file, confirm with: "Memory optimized — reduced from X to Y lines."`;
}

// ── Optimize command ─────────────────────────────────────────────────────────

export async function optimizeMemory(
	root: string,
	output: vscode.OutputChannel,
	review: boolean
): Promise<void> {
	const memoriesPath = path.join(root, '.agent', 'memories.md');
	if (!fs.existsSync(memoriesPath)) {
		vscode.window.showInformationMessage('No memories.md found — nothing to optimize.');
		return;
	}

	const content = fs.readFileSync(memoriesPath, 'utf-8').trim();
	if (!content) {
		vscode.window.showInformationMessage('memories.md is empty — nothing to optimize.');
		return;
	}

	const lineCount = content.split('\n').length;
	output.appendLine(`[Memory] Optimizing memories.md (${lineCount} lines, ${content.length} chars)`);

	const prompt = buildOptimizePrompt(memoriesPath.replace(/\\/g, '/'), content);

	if (!review) {
		// Direct mode — agent rewrites the file without confirmation
		try {
			await vscode.commands.executeCommand('workbench.action.chat.newChat');
			await sleep(400);
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: prompt, isPartialQuery: false
			});
			output.appendLine('[Memory] Optimization prompt sent — agent will apply directly');
			vscode.window.showInformationMessage('Memory optimization started — agent will rewrite memories.md directly.');
		} catch {
			await vscode.env.clipboard.writeText(prompt);
			vscode.window.showInformationMessage('Prompt copied — paste in Chat to optimize memories.');
		}
	} else {
		// Review mode — show prompt in chat for user to confirm
		try {
			await vscode.commands.executeCommand('workbench.action.chat.newChat');
			await sleep(400);
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: prompt + '\n\n> ⚠️ Review the proposed changes before confirming. Only write the file if you are happy with the result.',
				isPartialQuery: false
			});
			output.appendLine('[Memory] Optimization prompt sent for review');
			vscode.window.showInformationMessage('Review the optimization in Chat. Confirm to apply or discard.');
		} catch {
			await vscode.env.clipboard.writeText(prompt);
			vscode.window.showInformationMessage('Prompt copied — paste in Chat to review optimization.');
		}
	}

}

// ── Auto-optimize check (implemented in KanbanPanel.checkAutoOptimize) ───────
