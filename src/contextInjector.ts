/**
 * contextInjector.ts — ISSUE-002 Task context injection inteligente
 *
 * Implements ADR-002: Section-based memory injection to reduce context size
 * and improve prompt relevance.
 *
 * Sections:
 *   - Core:         Always injected (project goal, stack, key facts)
 *   - Conventions:  Always injected (naming, patterns, rules)
 *   - Decisions:    Injected only if the task depends on them
 *   - Task History: NEVER injected automatically
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MemorySection {
	name: string;
	content: string;
	startLine: number;
	endLine: number;
}

export interface InjectionResult {
	core: string;
	conventions: string;
	decisions: string | null;
	taskHistory: string | null;
	injected: string;
	sectionsFound: string[];
	decisionsReason: string | null;
}

// ── Section names (h2-level in memories.md) ──────────────────────────────────

const SECTION_CORE = 'Project';
const SECTION_CONVENTIONS = 'Conventions';
const SECTION_DECISIONS = 'Decisions';
const SECTION_TASK_HISTORY = 'Completed Tasks';
const SECTION_KNOWN_ISSUES = 'Known Issues';

// All recognized section names
const ALL_SECTIONS = [
	SECTION_CORE,
	SECTION_CONVENTIONS,
	SECTION_DECISIONS,
	SECTION_TASK_HISTORY,
	SECTION_KNOWN_ISSUES,
];

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse memories.md into named sections based on ## headings.
 * Each section starts at a `## SectionName` line and ends just before the next
 * `## ` heading or EOF.
 */
export function parseMemorySections(content: string): MemorySection[] {
	const lines = content.split('\n');
	const sections: MemorySection[] = [];

	// Find all ## headings and their positions
	const headings: { name: string; lineIdx: number }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(/^##\s+(.+)$/);
		if (match) {
			headings.push({ name: match[1].trim(), lineIdx: i });
		}
	}

	// Build sections from heading ranges
	for (let h = 0; h < headings.length; h++) {
		const startLine = headings[h].lineIdx;
		const endLine = h + 1 < headings.length
			? headings[h + 1].lineIdx - 1
			: lines.length - 1;

		const sectionLines = lines.slice(startLine, endLine + 1);
		const sectionContent = sectionLines.join('\n').trim();

		sections.push({
			name: headings[h].name,
			content: sectionContent,
			startLine: startLine + 1, // 1-indexed
			endLine: endLine + 1,
		});
	}

	return sections;
}

// ── Dependency detection ─────────────────────────────────────────────────────

/**
 * Keywords that suggest a task depends on architectural decisions.
 */
const DECISION_KEYWORDS = [
	'decision', 'decisión', 'adr', 'architecture', 'arquitectura',
	'migrate', 'migrar', 'refactor', 'stack', 'framework', 'library',
	'biblioteca', 'design', 'diseño', 'pattern', 'patrón',
	'strategy', 'estrategia', 'approach', 'enfoque',
	'security', 'seguridad', 'auth', 'authentication', 'autenticación',
	'database', 'base de datos', 'schema', 'esquema',
	'api', 'endpoint', 'integration', 'integración',
	'performance', 'rendimiento', 'scalability', 'escalabilidad',
	'dependency', 'dependencia', 'deprecat', 'replace', 'reemplazar',
	'upgrade', 'actualizar', 'version', 'versión',
];

/**
 * Determine whether a task's description/dependencies suggest that
 * architectural decisions are relevant.
 */
export function taskNeedsDecisions(
	taskDescription: string,
	taskDependencies: string[],
	taskLabels: string[] = [],
	taskEpic?: string
): { needed: boolean; reason: string | null } {
	const searchSpace = [
		taskDescription,
		taskEpic ?? '',
		...taskLabels,
		...taskDependencies,
	].join(' ').toLowerCase();

	for (const keyword of DECISION_KEYWORDS) {
		if (searchSpace.includes(keyword)) {
			return {
				needed: true,
				reason: `Keyword "${keyword}" found in task context`,
			};
		}
	}

	// If task has dependencies, decisions might be relevant
	if (taskDependencies.length > 0) {
		return {
			needed: true,
			reason: `Task has ${taskDependencies.length} dependencies`,
		};
	}

	return { needed: false, reason: null };
}

// ── Core injection logic ─────────────────────────────────────────────────────

/**
 * Inject memory sections based on ADR-002 rules:
 *   - Core + Conventions: ALWAYS injected
 *   - Decisions: only if taskNeedsDecisions() returns true
 *   - Task History: NEVER injected automatically
 *   - Known Issues: injected alongside Core (always relevant)
 */
export function injectContext(
	memoriesContent: string,
	taskDescription: string,
	taskDependencies: string[],
	taskLabels: string[] = [],
	taskEpic?: string
): InjectionResult {
	const sections = parseMemorySections(memoriesContent);

	// Helper: find section by name (fuzzy match)
	const findSection = (name: string): MemorySection | undefined =>
		sections.find(s => s.name.toLowerCase() === name.toLowerCase());

	// Helper: find section containing a keyword
	const findSectionContaining = (keyword: string): MemorySection | undefined =>
		sections.find(s => s.name.toLowerCase().includes(keyword.toLowerCase()));

	// Always-injected sections
	const coreSection = findSection(SECTION_CORE) || findSectionContaining('project');
	const conventionsSection = findSection(SECTION_CONVENTIONS) || findSectionContaining('convention');
	const knownIssuesSection = findSection(SECTION_KNOWN_ISSUES) || findSectionContaining('known issue');

	// Conditional sections
	const decisionsSection = findSection(SECTION_DECISIONS) || findSectionContaining('decision');
	const taskHistorySection = findSection(SECTION_TASK_HISTORY) || findSectionContaining('completed task');

	// Determine if decisions are needed
	const { needed: needsDecisions, reason: decisionsReason } = taskNeedsDecisions(
		taskDescription, taskDependencies, taskLabels, taskEpic
	);

	// Build injected context
	const parts: string[] = [];
	const sectionsFound: string[] = [];

	// 1. Core — always
	if (coreSection && coreSection.content) {
		parts.push(coreSection.content);
		sectionsFound.push(SECTION_CORE);
	}

	// 2. Conventions — always
	if (conventionsSection && conventionsSection.content) {
		parts.push(conventionsSection.content);
		sectionsFound.push(SECTION_CONVENTIONS);
	}

	// 3. Known Issues — always (project health awareness)
	if (knownIssuesSection && knownIssuesSection.content) {
		parts.push(knownIssuesSection.content);
		sectionsFound.push(SECTION_KNOWN_ISSUES);
	}

	// 4. Decisions — conditional
	let injectedDecisions: string | null = null;
	if (needsDecisions && decisionsSection && decisionsSection.content) {
		injectedDecisions = decisionsSection.content;
		parts.push(injectedDecisions);
		sectionsFound.push(SECTION_DECISIONS);
	}

	// 5. Task History — NEVER injected automatically
	const taskHistoryContent = taskHistorySection?.content ?? null;

	return {
		core: coreSection?.content ?? '',
		conventions: conventionsSection?.content ?? '',
		decisions: injectedDecisions,
		taskHistory: taskHistoryContent,
		injected: parts.join('\n\n'),
		sectionsFound,
		decisionsReason,
	};
}

// ── High-level API ───────────────────────────────────────────────────────────

/**
 * Load memories.md from disk and inject relevant sections for a task.
 * Returns null if the file doesn't exist.
 */
export function loadAndInjectContext(
	workspaceRoot: string,
	taskDescription: string,
	taskDependencies: string[],
	taskLabels: string[] = [],
	taskEpic?: string
): InjectionResult | null {
	const memoriesPath = path.join(workspaceRoot, '.agent', 'memories.md');
	if (!fs.existsSync(memoriesPath)) {
		return null;
	}
	const content = fs.readFileSync(memoriesPath, 'utf-8').trim();
	if (!content) {
		return null;
	}
	return injectContext(content, taskDescription, taskDependencies, taskLabels, taskEpic);
}
