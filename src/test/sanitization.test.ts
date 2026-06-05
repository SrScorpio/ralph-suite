import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getBoardContent, esc, escAttr, escJsArg } from '../webview/kanbanHtml';
import { PrdManager } from '../prdManager';
import { RalphStateManager, safeTaskId } from '../stateManager';

describe('sanitization', () => {
	it('escapes HTML, attributes and inline JS arguments', () => {
		assert.strictEqual(esc(`<img src=x onerror='x'>`), '&lt;img src=x onerror=&#39;x&#39;&gt;');
		assert.strictEqual(escAttr('a"\n<b>'), 'a&quot;&lt;b&gt;');
		assert.ok(escJsArg(`bad');alert(1);//`).startsWith('&quot;'));
		assert.ok(escJsArg(`bad');alert(1);//`).includes('&#39;'));
	});

	it('escapes PRD content rendered into the board', () => {
		const html = getBoardContent({
			project: 'x',
			description: '',
			version: '1',
			issues: [{
				id: `ISSUE-001`,
				title: `<img src=x onerror=alert(1)>`,
				description: `<script>alert(1)</script>`,
				epic: `E" onclick="alert(1)`,
				priority: 'P0',
				status: 'todo',
				acceptanceCriteria: [`close " attr`],
				dependencies: [`DEP-001"><script>alert(1)</script>`],
				labels: [`l<script>`],
			}],
		}, null, {}, { autoRun: false, maxLoops: 1, guardrails: [], boundaries: [], view: 'board' });

		assert.ok(!html.includes('<script>alert(1)</script>'));
		assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
		assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
		assert.ok(html.includes('data-id="ISSUE-001"'));
	});
});

describe('PRD normalization', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-prd-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('normalizes invalid IDs, duplicate IDs and non-array fields', () => {
		fs.writeFileSync(path.join(tmpDir, 'prd.json'), JSON.stringify({
			project: 42,
			issues: [
				{ id: '../bad id', title: 7, labels: 'x', dependencies: ['DEP 1'] },
				{ id: '../bad id', title: 'Second' },
			],
		}), 'utf-8');

		const prd = PrdManager.load(tmpDir);
		assert.ok(prd);
		assert.strictEqual(prd!.project, 'Unnamed Project');
		assert.strictEqual(prd!.issues[0].id, safeTaskId('../bad id'));
		assert.notStrictEqual(prd!.issues[0].id, prd!.issues[1].id);
		assert.deepStrictEqual(prd!.issues[0].labels, []);
		assert.deepStrictEqual(prd!.issues[0].dependencies, ['DEP_1']);
	});

	it('mutates and saves PRD through the central raw API', () => {
		fs.writeFileSync(path.join(tmpDir, 'prd.json'), JSON.stringify({
			project: 'x',
			issues: [{ id: 'ISSUE-001', title: 'One' }],
		}), 'utf-8');

		const changed = PrdManager.mutateRaw(tmpDir, (_raw, items) => {
			items.push({ id: 'ISSUE-002', title: 'Two' });
		});

		assert.strictEqual(changed, true);
		const raw = PrdManager.loadRaw(tmpDir);
		assert.strictEqual(raw.issues.length, 2);
		assert.strictEqual(raw.issues[1].id, 'ISSUE-002');
	});

	it('returns false and does not save when mutator cancels', () => {
		fs.writeFileSync(path.join(tmpDir, 'prd.json'), JSON.stringify({
			project: 'x',
			issues: [{ id: 'ISSUE-001', title: 'One' }],
		}), 'utf-8');

		const changed = PrdManager.mutateRaw(tmpDir, (_raw, items) => {
			items.push({ id: 'ISSUE-002', title: 'Two' });
			return false;
		});

		assert.strictEqual(changed, false);
		const raw = PrdManager.loadRaw(tmpDir);
		assert.strictEqual(raw.issues.length, 1);
	});

	it('supports configured PRD paths inside the workspace and rejects traversal outside it', () => {
		const customDir = path.join(tmpDir, 'data');
		fs.mkdirSync(customDir, { recursive: true });
		PrdManager.saveRaw(tmpDir, {
			project: 'custom',
			issues: [{ id: 'ISSUE-001', title: 'One' }],
		}, 'data/custom-prd.json');

		assert.ok(fs.existsSync(path.join(customDir, 'custom-prd.json')));
		assert.strictEqual(PrdManager.load(tmpDir, 'data/custom-prd.json')!.project, 'custom');
		assert.strictEqual(PrdManager.prdPath(tmpDir, '../outside.json'), path.join(tmpDir, 'prd.json'));
	});
});

describe('stable memory promotion', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-memory-'));
		RalphStateManager.ensure(tmpDir);
		fs.writeFileSync(
			path.join(tmpDir, '.agent', 'memories.md'),
			'# Project Memories\n\n## Project\n- Goal: Test\n\n## Decisions\n',
			'utf-8'
		);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('keeps ordinary NOTA out of stable memories', () => {
		RalphStateManager.appendMemory(tmpDir, {
			id: 'ISSUE-001',
			title: 'Task',
			status: 'completed',
			startedAt: new Date().toISOString(),
			note: 'NOTA: Fixed a small thing',
		});

		const memories = fs.readFileSync(path.join(tmpDir, '.agent', 'memories.md'), 'utf-8');
		assert.ok(!memories.includes('Fixed a small thing'));
	});

	it('promotes typed decisions into the matching memory section', () => {
		RalphStateManager.appendMemory(tmpDir, {
			id: 'ISSUE-002',
			title: 'Task',
			status: 'completed',
			startedAt: new Date().toISOString(),
			note: 'DECISION: Keep PRD immutable for agents',
		});

		const memories = fs.readFileSync(path.join(tmpDir, '.agent', 'memories.md'), 'utf-8');
		assert.ok(memories.includes('## Decisions'));
		assert.ok(memories.includes('Keep PRD immutable for agents'));
	});
});
