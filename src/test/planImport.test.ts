import * as assert from 'assert';
import { importPlanToPrd, generateNextId } from '../kanban/planImport';

describe('planImport', () => {
	describe('generateNextId', () => {
		it('detects ISSUE-NNN format and increments', () => {
			assert.strictEqual(generateNextId(['ISSUE-001', 'ISSUE-002', 'ISSUE-005']), 'ISSUE-006');
		});

		it('detects US-NNN format', () => {
			assert.strictEqual(generateNextId(['US-010', 'US-003']), 'US-011');
		});

		it('detects STEP-NNN format', () => {
			assert.strictEqual(generateNextId(['STEP-001', 'STEP-002']), 'STEP-003');
		});

		it('detects TASK-NNN format', () => {
			assert.strictEqual(generateNextId(['TASK-001']), 'TASK-002');
		});

		it('falls back to ISSUE-001 when no existing IDs', () => {
			assert.strictEqual(generateNextId([]), 'ISSUE-001');
		});

		it('falls back to ISSUE-NNN when IDs do not match known patterns', () => {
			assert.strictEqual(generateNextId(['custom-42', 'foo-99']), 'ISSUE-100');
		});

		it('handles empty/malformed IDs gracefully', () => {
			assert.strictEqual(generateNextId(['', 'garbage', '???']), 'ISSUE-001');
		});

		it('pads to 3 digits', () => {
			assert.strictEqual(generateNextId(['ISSUE-099']), 'ISSUE-100');
		});
	});

	describe('importPlanToPrd', () => {
		it('parses a well-formed plan markdown into issues', () => {
			const md = `## Plan: My Feature

TL;DR - A cool feature.

**Steps**

1. **Setup base** — create the structure
2. **Add tests** — ensure coverage
3. **Ship it**`;
			const result = importPlanToPrd(md);
			assert.ok(result, 'should return a result');
			assert.strictEqual(result!.project, 'My Feature');
			assert.strictEqual(result!.description, 'A cool feature.');
			assert.strictEqual(result!.issues.length, 3);
			assert.strictEqual(result!.issues[0].id, 'STEP-001');
			assert.strictEqual(result!.issues[0].title, 'Setup base');
			assert.strictEqual(result!.issues[1].id, 'STEP-002');
			assert.strictEqual(result!.issues[1].dependencies[0], 'STEP-001', 'sequential deps');
			assert.strictEqual(result!.issues[2].title, 'Ship it');
		});

		it('parses H3 heading steps (### N. Title)', () => {
			const md = `## Plan: Another

**Steps**

### 1. First task
### 2. Second task`;
			const result = importPlanToPrd(md);
			assert.ok(result);
			assert.strictEqual(result!.issues.length, 2);
			assert.strictEqual(result!.issues[0].title, 'First task');
			assert.strictEqual(result!.issues[1].title, 'Second task');
		});

		it('returns empty issues array for markdown without steps', () => {
			const md = `# Just a title

Some description but no steps section.`;
			const result = importPlanToPrd(md);
			assert.ok(result, 'parser always returns a result');
			assert.strictEqual(result!.issues.length, 0);
		});

		it('assigns default priority P2 and status todo', () => {
			const md = `# Plan: X

**Steps**

1. **Do something**`;
			const result = importPlanToPrd(md);
			assert.ok(result);
			assert.strictEqual(result!.issues[0].priority, 'P2');
			assert.strictEqual(result!.issues[0].status, 'todo');
		});

		it('creates sequential dependencies between steps', () => {
			const md = `# Plan: X

**Steps**

1. **A**
2. **B**
3. **C**
4. **D**`;
			const result = importPlanToPrd(md);
			assert.ok(result);
			assert.deepStrictEqual(result!.issues[0].dependencies, []);
			assert.deepStrictEqual(result!.issues[1].dependencies, ['STEP-001']);
			assert.deepStrictEqual(result!.issues[2].dependencies, ['STEP-002']);
			assert.deepStrictEqual(result!.issues[3].dependencies, ['STEP-003']);
		});
	});
});
