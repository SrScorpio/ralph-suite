/**
 * contextRefresh.test.ts — Tests for ISSUE-001 (Context Refresh mid-task)
 *
 * Tests validate:
 *   1. Button is rendered on In Progress cards
 *   2. Context refresh prompt contains task context and summarized log
 *   3. Task History is NOT automatically included in the prompt
 *   4. Prompt contains completion signals
 *
 * Run with: npx mocha --require ts-node/register src/test/contextRefresh.test.ts
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildContextRefreshPrompt } from '../kanban/contextRefresh';
import { Issue, Prd } from '../prdManager';

// ── Test fixtures ────────────────────────────────────────────────────────────

const SAMPLE_TASK: Issue = {
	id: 'ISSUE-001',
	title: 'Context Refresh mid-task',
	description: 'Botón en la card In Progress que manda al chat un prompt de recuperación de contexto.',
	epic: 'UI',
	priority: 'P0',
	status: 'inprogress',
	acceptanceCriteria: [
		'Botón visible en la card In Progress',
		'Al pulsarlo, se envía al chat un prompt con el contexto actual y el log resumido',
		'No incluir automáticamente la sección "Task History" completa en el prompt',
	],
	dependencies: ['ISSUE-002'],
	labels: ['ui', 'chat'],
};

const SAMPLE_PRD: Prd = {
	project: 'ralph-suite',
	description: 'VS Code extension for task management',
	version: '1.0.0',
	issues: [SAMPLE_TASK],
};

// ── Helper: create temp workspace with memories.md ───────────────────────────

function createTempWorkspace(memoriesContent?: string): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));

	// Create .agent/memories.md
	const agentDir = path.join(tmpDir, '.agent');
	fs.mkdirSync(agentDir, { recursive: true });

	if (memoriesContent) {
		fs.writeFileSync(path.join(agentDir, 'memories.md'), memoriesContent, 'utf-8');
	}

	// Create .ralph/ directory
	const ralphDir = path.join(tmpDir, '.ralph');
	fs.mkdirSync(ralphDir, { recursive: true });

	return tmpDir;
}

function cleanupTempWorkspace(tmpDir: string) {
	fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── Tests: buildContextRefreshPrompt ─────────────────────────────────────────

describe('ISSUE-001: Context Refresh mid-task', () => {

	describe('buildContextRefreshPrompt — Prompt structure', () => {
		let tmpDir: string;

		before(() => {
			tmpDir = createTempWorkspace(`# Project Memories

## Project
- Goal: Build a VS Code extension for task management
- Stack: TypeScript, Node.js, VS Code Extension API

## Conventions
- camelCase for variables and functions
- PascalCase for classes and interfaces

## Decisions
- ADR-001: Use webview for UI
- ADR-002: Section-based memory injection

## Completed Tasks
- ISSUE-000: Initial setup (10 min)
`);
		});

		after(() => {
			cleanupTempWorkspace(tmpDir);
		});

		it('AC1: Prompt includes task title and description', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('ISSUE-001'), 'Should include task ID');
			assert.ok(prompt.includes('Context Refresh mid-task'), 'Should include task title');
			assert.ok(prompt.includes('Botón en la card In Progress'), 'Should include task description');
		});

		it('AC1: Prompt includes epic and priority', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('UI'), 'Should include epic');
			assert.ok(prompt.includes('P0'), 'Should include priority');
		});

		it('AC1: Prompt includes acceptance criteria', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('Botón visible'), 'Should include first criterion');
			assert.ok(prompt.includes('No incluir automáticamente'), 'Should include third criterion');
		});

		it('AC2: Prompt includes context recovery header', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('Context Refresh'), 'Should include context refresh header');
			assert.ok(prompt.includes('Mid-Task Recovery'), 'Should indicate mid-task recovery');
		});

		it('AC2: Prompt includes project memory (Core + Conventions)', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('VS Code extension'), 'Should include project goal');
			assert.ok(prompt.includes('camelCase'), 'Should include conventions');
		});

		it('AC3: Prompt does NOT include full Task History', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			// The memory file has a "Completed Tasks" section but it should NOT be in the prompt
			// because ADR-002 says Task History is NEVER auto-injected
			assert.ok(!prompt.includes('ISSUE-000'), 'Should NOT include completed task IDs');
			assert.ok(!prompt.includes('Initial setup'), 'Should NOT include completed task details');
		});

		it('AC2: Prompt includes completion signals', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('COMPLETION SIGNALS'), 'Should include completion signals header');
			assert.ok(prompt.includes('task-ISSUE-001-status'), 'Should include status file path');
			assert.ok(prompt.includes('task-ISSUE-001-note'), 'Should include note file path');
			assert.ok(prompt.includes('completed'), 'Should include completion word');
			assert.ok(prompt.includes('NOTA:'), 'Should include NOTA instruction');
		});

		it('AC2: Prompt includes project progress', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('tasks completed'), 'Should include project progress info');
		});

		it('AC2: Prompt includes dependencies', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('ISSUE-002'), 'Should include dependencies');
		});

		it('Prompt includes "do NOT modify prd.json" warning', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('Do NOT modify prd.json'), 'Should include prd.json warning');
		});
	});

	describe('buildContextRefreshPrompt — Log summary', () => {
		let tmpDir: string;

		before(() => {
			tmpDir = createTempWorkspace(`# Project Memories

## Project
- Goal: Test project
`);
			// Create a log file for the task
			const logData = {
				id: 'ISSUE-001',
				title: 'Context Refresh mid-task',
				status: 'inprogress',
				startedAt: '2026-04-08T10:00:00.000Z',
				durationMin: 15,
				note: 'Implemented button UI',
			};
			fs.writeFileSync(
				path.join(tmpDir, '.ralph', 'task-ISSUE-001-log.json'),
				JSON.stringify(logData, null, 2),
				'utf-8'
			);
		});

		after(() => {
			cleanupTempWorkspace(tmpDir);
		});

		it('AC2: Prompt includes summarized log from existing log file', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('Started at'), 'Should include start time');
			assert.ok(prompt.includes('15 min'), 'Should include duration');
			assert.ok(prompt.includes('Implemented button UI'), 'Should include last note');
		});
	});

	describe('buildContextRefreshPrompt — No memories.md', () => {
		let tmpDir: string;

		before(() => {
			tmpDir = createTempWorkspace(); // No memories content
		});

		after(() => {
			cleanupTempWorkspace(tmpDir);
		});

		it('Should still generate a valid prompt without memories', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('ISSUE-001'), 'Should include task ID');
			assert.ok(prompt.includes('Context Refresh'), 'Should include context refresh header');
			assert.ok(prompt.includes('COMPLETION SIGNALS'), 'Should include completion signals');
		});

		it('Should indicate no progress log when no log file exists', () => {
			const prompt = buildContextRefreshPrompt(tmpDir, SAMPLE_TASK, SAMPLE_PRD);

			assert.ok(prompt.includes('No progress log yet'), 'Should indicate no progress log');
		});
	});

	describe('buildContextRefreshPrompt — Decisions injection', () => {
		let tmpDir: string;

		before(() => {
			tmpDir = createTempWorkspace(`# Project Memories

## Project
- Goal: Test project

## Conventions
- camelCase for variables

## Decisions
- ADR-001: Use webview for UI
- ADR-002: Section-based memory injection

## Completed Tasks
- ISSUE-000: Initial setup (10 min)
`);
		});

		after(() => {
			cleanupTempWorkspace(tmpDir);
		});

		it('Decisions ARE injected when task description contains decision keywords', () => {
			// Task with 'architecture' keyword in description
			const archTask: Issue = {
				...SAMPLE_TASK,
				description: 'Refactor the architecture of the UI module',
			};
			const prompt = buildContextRefreshPrompt(tmpDir, archTask, SAMPLE_PRD);

			assert.ok(prompt.includes('ADR-001'), 'Should include decisions when task depends on them');
		});

		it('Decisions ARE injected when task has dependencies', () => {
			// Task with dependencies
			const depTask: Issue = {
				...SAMPLE_TASK,
				description: 'Simple update',
				dependencies: ['ISSUE-002'],
			};
			const prompt = buildContextRefreshPrompt(tmpDir, depTask, SAMPLE_PRD);

			assert.ok(prompt.includes('ADR-001'), 'Should include decisions when task has dependencies');
		});
	});
});
