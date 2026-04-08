/**
 * contextInjector.test.ts — Tests for ISSUE-002 (Task context injection inteligente)
 *
 * Tests validate ADR-002 section-based injection:
 *   1. Core + Conventions: ALWAYS injected
 *   2. Decisions: ONLY when task depends on them
 *   3. Task History: NEVER injected automatically
 *   4. Known Issues: ALWAYS injected
 *
 * Run with: npx mocha --require ts-node/register src/test/contextInjector.test.ts
 */

import * as assert from 'assert';
import {
	parseMemorySections,
	taskNeedsDecisions,
	injectContext,
	MemorySection,
	InjectionResult,
} from '../contextInjector';

// ── Test fixtures ────────────────────────────────────────────────────────────

const SAMPLE_MEMORIES = `# Project Memories

> Auto-updated by Ralph Suite on task completion.
> Sections are injected intelligently by the context injector (ADR-002).

## Project
- Goal: Build a VS Code extension for task management
- Created: 2026-04-01
- Stack: TypeScript, Node.js, VS Code Extension API

## Conventions
- camelCase for variables and functions
- PascalCase for classes and interfaces
- Always use strict TypeScript
- Never use any type without justification

## Decisions
- ADR-001: Use webview for UI (not native panels)
- ADR-002: Section-based memory injection
- ADR-003: Git checkpoints are opt-in

## Known Issues
- Webview CSP can be too strict on some extensions
- Task polling has 5-second granularity

## Completed Tasks
- ISSUE-001: Initial project setup (30 min)
- ISSUE-000: Create prd.json (15 min)
`;

// ── Tests: parseMemorySections ───────────────────────────────────────────────

describe('parseMemorySections', () => {
	it('should parse all sections from a well-formed memories.md', () => {
		const sections = parseMemorySections(SAMPLE_MEMORIES);
		const names = sections.map(s => s.name);

		assert.ok(names.includes('Project'), 'Should find Project section');
		assert.ok(names.includes('Conventions'), 'Should find Conventions section');
		assert.ok(names.includes('Decisions'), 'Should find Decisions section');
		assert.ok(names.includes('Known Issues'), 'Should find Known Issues section');
		assert.ok(names.includes('Completed Tasks'), 'Should find Completed Tasks section');
	});

	it('should extract correct content for each section', () => {
		const sections = parseMemorySections(SAMPLE_MEMORIES);
		const project = sections.find(s => s.name === 'Project');

		assert.ok(project, 'Project section should exist');
		assert.ok(project!.content.includes('VS Code extension'), 'Should contain goal');
		assert.ok(project!.content.includes('TypeScript'), 'Should contain stack');
	});

	it('should return empty array for empty content', () => {
		const sections = parseMemorySections('');
		assert.strictEqual(sections.length, 0);
	});

	it('should handle content with no ## headings', () => {
		const sections = parseMemorySections('Just some text\nNo headings here');
		assert.strictEqual(sections.length, 0);
	});

	it('should handle single section', () => {
		const content = '## Project\n- Goal: Test\n';
		const sections = parseMemorySections(content);
		assert.strictEqual(sections.length, 1);
		assert.strictEqual(sections[0].name, 'Project');
	});

	it('should track correct line numbers', () => {
		const sections = parseMemorySections(SAMPLE_MEMORIES);
		const project = sections.find(s => s.name === 'Project');
		assert.ok(project!.startLine > 0, 'startLine should be positive');
		assert.ok(project!.endLine >= project!.startLine, 'endLine >= startLine');
	});
});

// ── Tests: taskNeedsDecisions ────────────────────────────────────────────────

describe('taskNeedsDecisions', () => {
	it('should return true for task with architecture keyword', () => {
		const result = taskNeedsDecisions('Refactor the architecture of the module', [], []);
		assert.strictEqual(result.needed, true);
		assert.ok(result.reason, 'Should provide a reason');
	});

	it('should return true for task with decision keyword', () => {
		const result = taskNeedsDecisions('Make a decision about the database', [], []);
		assert.strictEqual(result.needed, true);
	});

	it('should return true for task with dependencies', () => {
		const result = taskNeedsDecisions('Simple task', ['ISSUE-001'], []);
		assert.strictEqual(result.needed, true);
		assert.ok(result.reason!.includes('dependencies'), 'Reason should mention dependencies');
	});

	it('should return true for task with migration keyword', () => {
		const result = taskNeedsDecisions('Migrate from REST to GraphQL', [], []);
		assert.strictEqual(result.needed, true);
	});

	it('should return true for task with security keyword', () => {
		const result = taskNeedsDecisions('Fix the authentication flow', [], []);
		assert.strictEqual(result.needed, true);
	});

	it('should return true for task with ADR in epic', () => {
		const result = taskNeedsDecisions('Update documentation', [], [], 'Architecture');
		assert.strictEqual(result.needed, true);
	});

	it('should return true for task with label containing "refactor"', () => {
		const result = taskNeedsDecisions('Clean up code', [], ['refactor']);
		assert.strictEqual(result.needed, true);
	});

	it('should return false for simple task without decision keywords', () => {
		const result = taskNeedsDecisions('Fix typo in README', [], []);
		assert.strictEqual(result.needed, false);
		assert.strictEqual(result.reason, null);
	});

	it('should return false for simple UI fix', () => {
		const result = taskNeedsDecisions('Change button color', [], ['ui']);
		assert.strictEqual(result.needed, false);
	});

	it('should be case-insensitive', () => {
		const result = taskNeedsDecisions('PERFORMANCE optimization needed', [], []);
		assert.strictEqual(result.needed, true);
	});
});

// ── Tests: injectContext (ADR-002 compliance) ────────────────────────────────

describe('injectContext — ADR-002 compliance', () => {
	it('AC1: Core and Conventions are ALWAYS injected', () => {
		// Even for a trivial task
		const result = injectContext(SAMPLE_MEMORIES, 'Fix typo', [], [], undefined);

		assert.ok(result.injected.includes('## Project'), 'Core section should be injected');
		assert.ok(result.injected.includes('## Conventions'), 'Conventions section should be injected');
		assert.ok(result.sectionsFound.includes('Project'), 'Project in sectionsFound');
		assert.ok(result.sectionsFound.includes('Conventions'), 'Conventions in sectionsFound');
	});

	it('AC1: Decisions are NOT injected when task does not depend on them', () => {
		const result = injectContext(SAMPLE_MEMORIES, 'Fix typo in README', [], [], undefined);

		assert.ok(!result.injected.includes('## Decisions'), 'Decisions should NOT be injected');
		assert.strictEqual(result.decisions, null, 'Decisions should be null');
		assert.ok(!result.sectionsFound.includes('Decisions'), 'Decisions not in sectionsFound');
	});

	it('AC1: Decisions ARE injected when task depends on them', () => {
		const result = injectContext(
			SAMPLE_MEMORIES,
			'Refactor the database architecture',
			[], [], undefined
		);

		assert.ok(result.injected.includes('## Decisions'), 'Decisions should be injected');
		assert.ok(result.decisions !== null, 'Decisions should not be null');
		assert.ok(result.sectionsFound.includes('Decisions'), 'Decisions in sectionsFound');
		assert.ok(result.decisionsReason, 'Should have a reason');
	});

	it('AC1: Task History is NEVER injected automatically', () => {
		// Even with decision keywords
		const result = injectContext(
			SAMPLE_MEMORIES,
			'Major architecture refactor decision',
			['ISSUE-001'], [], undefined
		);

		assert.ok(!result.injected.includes('## Completed Tasks'),
			'Task History should NOT be injected');
		assert.strictEqual(result.taskHistory, '## Completed Tasks\n- ISSUE-001: Initial project setup (30 min)\n- ISSUE-000: Create prd.json (15 min)',
			'Task History content should be available separately');
	});

	it('AC1: Known Issues are ALWAYS injected', () => {
		const result = injectContext(SAMPLE_MEMORIES, 'Fix typo', [], [], undefined);

		assert.ok(result.injected.includes('## Known Issues'), 'Known Issues should be injected');
		assert.ok(result.sectionsFound.includes('Known Issues'), 'Known Issues in sectionsFound');
	});

	it('AC1: Decisions injected when task has dependencies', () => {
		const result = injectContext(
			SAMPLE_MEMORIES,
			'Simple update',
			['ISSUE-001'], [], undefined
		);

		assert.ok(result.injected.includes('## Decisions'),
			'Decisions should be injected when dependencies exist');
	});

	it('should return correct sectionsFound array', () => {
		const result = injectContext(SAMPLE_MEMORIES, 'Refactor architecture', [], [], undefined);

		assert.ok(result.sectionsFound.length >= 3,
			'Should find at least Project, Conventions, Known Issues');
	});

	it('should handle missing memories gracefully', () => {
		const minimalMemory = '# Project Memories\n\n## Project\n- Goal: Test\n';
		const result = injectContext(minimalMemory, 'Refactor architecture', [], [], undefined);

		assert.ok(result.core, 'Core should exist');
		assert.strictEqual(result.conventions, '', 'Conventions should be empty');
		assert.strictEqual(result.decisions, null, 'No decisions section');
		assert.strictEqual(result.taskHistory, null, 'No task history');
	});

	it('should handle empty memories content', () => {
		const result = injectContext('', 'Some task', [], [], undefined);

		assert.strictEqual(result.injected, '', 'Empty injection for empty content');
		assert.strictEqual(result.sectionsFound.length, 0, 'No sections found');
	});
});

// ── Tests: Section boundary edge cases ───────────────────────────────────────

describe('injectContext — edge cases', () => {
	it('should handle sections with empty content', () => {
		const memory = '# Memories\n\n## Project\n\n## Conventions\n- Use strict\n\n## Decisions\n\n## Completed Tasks\n';
		const result = injectContext(memory, 'Refactor architecture', [], [], undefined);

		assert.ok(result.sectionsFound.includes('Conventions'), 'Conventions found');
		// Decisions section exists but is empty — should not inject empty section
		assert.strictEqual(result.decisions, '## Decisions', 'Decisions has heading only');
	});

	it('should handle very long section content', () => {
		const longContent = Array(100).fill('- Some convention rule').join('\n');
		const memory = `# Memories\n\n## Project\n- Goal: Test\n\n## Conventions\n${longContent}\n`;
		const result = injectContext(memory, 'Fix typo', [], [], undefined);

		assert.ok(result.injected.includes('Some convention rule'), 'Long content preserved');
	});

	it('should not inject decisions for pure bugfix labels', () => {
		const result = injectContext(SAMPLE_MEMORIES, 'Fix null pointer in form handler', [], ['bugfix'], 'UI');
		assert.strictEqual(result.decisions, null, 'Bugfix should not need decisions');
	});
});
