/**
 * boardSanitizers.ts — Pure validation/sanitization helpers for webview messages.
 *
 * Extracted from kanbanPanel.ts to reduce its size and make these reusable/testable.
 * All functions are pure (no vscode/this dependencies).
 */

import { Issue } from './prdManager';
import { safeTaskId } from './stateManager';

/**
 * Validate a task ID coming from the webview. Returns null if invalid.
 * The raw value must survive the round-trip through safeTaskId unchanged.
 */
export function safeMessageId(raw: unknown): string | null {
	if (typeof raw !== 'string') { return null; }
	const id = safeTaskId(raw);
	return id === raw.trim() && id !== 'UNKNOWN' ? id : null;
}

/** Type guard: is the value a valid board status? */
export function isBoardStatus(raw: unknown): raw is Issue['status'] {
	return raw === 'todo' || raw === 'inprogress' || raw === 'completed' || raw === 'blocked' || raw === 'failed';
}

/** Sanitize a text value from untrusted input, with a max length. */
export function cleanText(raw: unknown, max = 1000): string {
	return String(raw ?? '').trim().slice(0, max);
}

/** Sanitize an array of strings from untrusted input. */
export function cleanTextArray(raw: unknown, maxItems = 100): string[] {
	if (!Array.isArray(raw)) { return []; }
	return raw
		.filter((v): v is string => typeof v === 'string')
		.map(v => v.trim())
		.filter(Boolean)
		.slice(0, maxItems);
}

/** Coerce a raw value into a valid priority, defaulting to P2. */
export function cleanPriority(raw: unknown): Issue['priority'] {
	return raw === 'P0' || raw === 'P1' || raw === 'P2' || raw === 'P3' ? raw : 'P2';
}

/** Sanitize all editable fields of an issue coming from the webview modal. */
export function cleanIssueFields(raw: any): Partial<Issue> {
	return {
		title:              cleanText(raw?.title, 240),
		description:        cleanText(raw?.description, 4000),
		epic:               cleanText(raw?.epic, 120) || undefined,
		priority:           cleanPriority(raw?.priority),
		acceptanceCriteria: cleanTextArray(raw?.acceptanceCriteria),
		labels:             cleanTextArray(raw?.labels).map(l => l.slice(0, 80)),
		dependencies:       cleanTextArray(raw?.dependencies).map(safeTaskId),
	};
}

/**
 * Cryptographically-suitable nonce generator for webview CSP.
 * 32 chars from [A-Za-z0-9] = ~190 bits of entropy.
 */
export function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
