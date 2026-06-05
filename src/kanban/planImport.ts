/**
 * planImport.ts — Parser de markdown (plan agent) → prd.json e ID generator
 *
 * Extraído de kanbanPanel.ts durante la modularización (ADR-014).
 */

import { Prd } from '../prdManager';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImportedPrd {
	project:     string;
	description: string;
	version:     string;
	issues:      any[];
}

// ── Plan markdown → prd.json parser ─────────────────────────────────────────

export function importPlanToPrd(markdown: string): ImportedPrd | null {
	const lines = markdown.split('\n');

	// Extract title from "## Plan: <title>" or first H1/H2
	let project     = 'Imported Project';
	let description = '';

	const titleMatch = markdown.match(/##\s+Plan:\s*(.+)/);
	if (titleMatch) { project = titleMatch[1].trim(); }
	else {
		const h1 = markdown.match(/^#\s+(.+)/m);
		if (h1) { project = h1[1].trim(); }
	}

	// Extract TL;DR as description
	const tldrMatch = markdown.match(/TL;DR[^\n]*[-–]\s*(.+)/i);
	if (tldrMatch) { description = tldrMatch[1].trim(); }

	// Parse numbered steps from "**Steps**" section
	const issues: any[] = [];
	let inSteps    = false;
	let stepNum    = 0;
	let currentStep: any = null;

	// Find relevant files section for later cross-referencing
	const relevantFiles: string[] = [];
	const fileMatches = markdown.matchAll(/`([^`]+\.[a-z]{2,6})`/g);
	for (const m of fileMatches) { relevantFiles.push(m[1]); }

	// Find verification section
	const verification: string[] = [];
	let inVerification = false;
	for (const line of lines) {
		if (/^\*\*Verification\*\*/i.test(line)) { inVerification = true; continue; }
		if (inVerification) {
			if (/^\*\*/.test(line)) { inVerification = false; continue; }
			const v = line.replace(/^[-*]\s*/, '').trim();
			if (v) { verification.push(v); }
		}
	}

	for (const line of lines) {
		// Detect numbered step: "1. **Title**" or "**Step 1: Title**"
		const stepTitle = line.match(/^\d+\.\s+\*\*(.+?)\*\*/)
			|| line.match(/^\*\*Step\s+\d+:\s*(.+?)\*\*/i);

		// Detect "### N. Title" in section
		const h3Step = line.match(/^###\s+\d+\.\s+(.+)/);

		if (stepTitle) {
			// Save previous step
			if (currentStep) { issues.push(currentStep); }
			stepNum++;
			currentStep = {
				id: `STEP-${String(stepNum).padStart(3, '0')}`,
				title: stepTitle[1].trim(),
				description: '',
				epic: undefined,
				priority: 'P2',
				status: 'todo',
				acceptanceCriteria: [] as string[],
				dependencies: [] as string[],
				labels: [] as string[],
			};
			inSteps = true;
		} else if (h3Step) {
			if (currentStep) { issues.push(currentStep); }
			stepNum++;
			currentStep = {
				id: `STEP-${String(stepNum).padStart(3, '0')}`,
				title: h3Step[1].trim(),
				description: '',
				epic: undefined,
				priority: 'P2',
				status: 'todo',
				acceptanceCriteria: [] as string[],
				dependencies: [] as string[],
				labels: [] as string[],
			};
			inSteps = true;
		} else if (currentStep && inSteps) {
			const trimmed = line.trim();
			if (!trimmed) { continue; }

			// Detect deprecation
			if (/deprecat|reemplazar|replace|migrate/i.test(trimmed)) {
				currentStep.labels.push('migration');
			}

			// Detect criteria (checklist items)
			const acMatch = trimmed.match(/^[-*]\s*\[.?\]\s*(.+)/);
			if (acMatch) {
				currentStep.acceptanceCriteria.push(acMatch[1].trim());
				continue;
			}

			// Detect epics
			const epicMatch = trimmed.match(/^Epic[:\s]+(.+)/i);
			if (epicMatch) {
				currentStep.epic = epicMatch[1].trim();
				continue;
			}

			// Detect priority
			const prioMatch = trimmed.match(/^Priority[:\s]+(.+)/i);
			if (prioMatch) {
				currentStep.priority = prioMatch[1].trim().toUpperCase();
				continue;
			}

			// Everything else is description
			if (currentStep.description) {
				currentStep.description += '\n' + trimmed;
			} else {
				currentStep.description = trimmed;
			}
		}
	}

	// Push last step
	if (currentStep) { issues.push(currentStep); }

	// Post-process: add relevant file references to descriptions
	if (relevantFiles.length > 0) {
		for (const issue of issues) {
			issue.description += `\n\n**Related files:** ${relevantFiles.join(', ')}`;
		}
	}

	// Post-process: add verification to descriptions if not already included
	if (verification.length > 0 && issues.length > 0) {
		issues[issues.length - 1].acceptanceCriteria.push(...verification);
	}

	return {
		project,
		description,
		version: '1.0.0',
		issues,
	};
}

// ── ID generation ────────────────────────────────────────────────────────────

export function generateNextId(existingIds: string[]): string {
	// Detect format from existing IDs: US-001, ISSUE-001, STEP-001, TASK-001
	const patterns = [
		{ re: /^(US)-(\d+)$/, prefix: 'US' },
		{ re: /^(ISSUE)-(\d+)$/, prefix: 'ISSUE' },
		{ re: /^(STEP)-(\d+)$/, prefix: 'STEP' },
		{ re: /^(TASK)-(\d+)$/, prefix: 'TASK' },
	];

	for (const { re, prefix } of patterns) {
		const nums = existingIds
			.map(id => { const m = id.match(re); return m ? parseInt(m[2], 10) : null; })
			.filter((n): n is number => n !== null);
		if (nums.length > 0) {
			const next = Math.max(...nums) + 1;
			return `${prefix}-${String(next).padStart(3, '0')}`;
		}
	}

	// Fallback: ISSUE-NNN
	const fallbackNums = existingIds
		.map(id => { const m = id.match(/(\d+)$/); return m ? parseInt(m[1], 10) : null; })
		.filter((n): n is number => n !== null);
	const next = fallbackNums.length > 0 ? Math.max(...fallbackNums) + 1 : 1;
	return `ISSUE-${String(next).padStart(3, '0')}`;
}

// ── Add from Chat prompt ─────────────────────────────────────────────────────

export function buildAddFromChatPrompt(prd: Prd | null, prdPath: string): string {
	const projectName = prd?.project ?? 'this project';
	const existingIds = (prd?.issues ?? []).map(i => i.id);
	const nextId      = generateNextId(existingIds);
	const epics       = prd ? [...new Set(prd.issues.map(i => i.epic || 'General'))].join(', ') : '';

	return [
		`I want to add one or more new issues to the prd.json for **${projectName}**.`,
		``,
		`Existing epics: ${epics || 'none yet'}`,
		`Next available ID: ${nextId}`,
		`prd.json location: \`${prdPath.replace(/\\/g, '/')}\``,
		``,
		`Please ask me what I want to add (in natural language), then:`,
		`1. Break it down into one or more concrete issues`,
		`2. For each issue generate a JSON object following this schema:`,
		`   - id: string starting from ${nextId} (increment for each new issue)`,
		`   - title: short descriptive title`,
		`   - description: what needs to be done`,
		`   - epic: pick from existing epics or create a new one`,
		`   - priority: "P0" | "P1" | "P2" | "P3"`,
		`   - status: always "todo"`,
		`   - acceptanceCriteria: array of strings`,
		`   - dependencies: array of existing issue IDs this depends on (empty if none)`,
		`   - labels: array of strings`,
		`3. Add the new issue(s) to the \`issues\` array (or \`userStories\` if that key exists) in \`${prdPath.replace(/\\/g, '/')}\``,
		`4. Do NOT modify any existing issues — only append`,
		`5. Confirm what was added with a brief summary`,
	].join('\n');
}
