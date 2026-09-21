import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildAnalyzeExistingProjectPrompt } from '../kanban/analyzeProject';
import {
	allocateNewBacklogId,
	appendImportedIssues,
	applyEditedBacklogId,
	buildAddFromChatPrompt,
	generateNextId,
	importPlanToPrd,
	isValidNewBacklogId,
	persistNewBacklogItem,
} from '../kanban/planImport';
import { buildInitPromptText } from '../agentsMdBuilders';
import { PrdManager } from '../prdManager';
import { getBoardContent } from '../webview/kanbanHtml';

const PLAN_MD = `## Plan: My Feature

TL;DR - A cool feature.

**Steps**

1. **Setup base** — create the structure
2. **Add tests** — ensure coverage
3. **Ship it**`;

describe('AC1 Analyze prompt IDs', () => {
	it('exige ISSUE-NNN, prohíbe ids numéricos y la clave tasks, y usa el ejemplo ISSUE-001', () => {
		const prompt = buildAnalyzeExistingProjectPrompt(['C:/proj']);
		assert.ok(prompt.includes('ISSUE-NNN') || prompt.includes('ISSUE-001'));
		assert.ok(prompt.includes('"id": "ISSUE-001"'));
		assert.ok(prompt.includes('"issues"'));
		assert.ok(/not tasks|no(?:t)? the key ["']?tasks/i.test(prompt) || prompt.includes('not tasks'));
		assert.ok(/1,\s*001|numeric-only|solo numéric/i.test(prompt) || prompt.includes('1, 001') || prompt.includes('(1, 001)'));
		assert.ok(/GitHub #N|#1/i.test(prompt));
		assert.ok(!/"id":\s*1\b/.test(prompt), 'example must not use numeric id 1');
	});
});

describe('AC2 Init prompt IDs', () => {
	it('usa ISSUE-001/ISSUE-002 y prohíbe IDs numéricos sueltos sin inferir GitHub', () => {
		const prompt = buildInitPromptText('ship a plugin', '/tmp/proj', [], []);
		assert.ok(prompt.includes('"id": "ISSUE-001"'));
		assert.ok(prompt.includes('ISSUE-002'));
		assert.ok(/numeric-only|1, 001|numéricos sueltos/i.test(prompt) || prompt.includes('(1, 001)'));
		assert.ok(/GitHub/i.test(prompt));
		assert.ok(!/"id":\s*1\b/.test(prompt));
	});
});

describe('AC3 importPlanToPrd IDs', () => {
	it('genera ISSUE-001/002/003 y no STEP-*', () => {
		const result = importPlanToPrd(PLAN_MD);
		assert.ok(result);
		assert.deepStrictEqual(result!.issues.map((i: { id: string }) => i.id), ['ISSUE-001', 'ISSUE-002', 'ISSUE-003']);
		assert.ok(!result!.issues.some((i: { id: string }) => i.id.startsWith('STEP-')));
		assert.deepStrictEqual(result!.issues[1].dependencies, ['ISSUE-001']);
		assert.deepStrictEqual(result!.issues[2].dependencies, ['ISSUE-002']);
	});

	it('al hacer append sobre 1 y ISSUE-002 no colisiona', () => {
		const imported = importPlanToPrd(PLAN_MD)!;
		const existing = [{ id: '1', title: 'legacy' }, { id: 'ISSUE-002', title: 'kept' }];
		const added = appendImportedIssues(existing, imported.issues);
		const ids = [...existing, ...added].map(i => String(i.id));
		assert.strictEqual(new Set(ids).size, ids.length, 'no id collisions');
		assert.ok(ids.includes('1'));
		assert.ok(ids.includes('ISSUE-002'));
		assert.ok(added.every(i => isValidNewBacklogId(i.id)));
		assert.ok(added.every(i => i.id.startsWith('ISSUE-')));
		assert.ok(!added.some(i => i.id === '1' || i.id === 'ISSUE-002'));
	});
});

describe('AC4 generateNextId / addIssue', () => {
	it('PRD con 1, 2, ISSUE-001 → siguiente ISSUE-003', () => {
		assert.strictEqual(generateNextId(['1', '2', 'ISSUE-001']), 'ISSUE-003');
	});

	it('persiste ISSUE-003 sin reescribir 1 ni 2', () => {
		const existing = [{ id: '1' }, { id: '2' }, { id: 'ISSUE-001' }];
		const created = persistNewBacklogItem({ title: 'nueva' } as { title: string; id?: string }, existing.map(i => i.id));
		assert.strictEqual(created.id, 'ISSUE-003');
		assert.deepStrictEqual(existing.map(i => i.id), ['1', '2', 'ISSUE-001']);
	});

	it('no reutiliza prefijos US/STEP/TASK', () => {
		assert.strictEqual(generateNextId(['US-010', 'US-003']), 'ISSUE-011');
		assert.strictEqual(generateNextId(['STEP-001', 'STEP-002']), 'ISSUE-003');
		assert.strictEqual(generateNextId(['TASK-001']), 'ISSUE-002');
	});

	it('vacío → ISSUE-001; max+1 con padding; ISSUE-1000 si hace falta', () => {
		assert.strictEqual(generateNextId([]), 'ISSUE-001');
		assert.strictEqual(generateNextId(['1', '4']), 'ISSUE-005');
		assert.strictEqual(generateNextId(['ISSUE-001', '12']), 'ISSUE-013');
		assert.strictEqual(generateNextId(['ISSUE-999']), 'ISSUE-1000');
	});
});

describe('AC5 Add from Chat prompt', () => {
	it('Next available ID es el siguiente ISSUE-NNN y prohíbe ids numéricos', () => {
		const prompt = buildAddFromChatPrompt({
			project: 'Demo',
			description: '',
			version: '1.0.0',
			issues: [
				{ id: '1', title: 'a', description: '', priority: 'P2', status: 'todo', acceptanceCriteria: [], dependencies: [], labels: [] },
				{ id: 'ISSUE-002', title: 'b', description: '', priority: 'P2', status: 'todo', acceptanceCriteria: [], dependencies: [], labels: [] },
			],
		}, 'docs/ralph/prd.json');
		assert.ok(prompt.includes('Next available ID: ISSUE-003'));
		assert.ok(/ISSUE-NNN|numeric-only|1 or 001/i.test(prompt));
	});
});

describe('AC6 persist new item IDs', () => {
	it('acepta TSK-004 e ISSUE-007 si no colisionan', () => {
		assert.ok(isValidNewBacklogId('TSK-004'));
		assert.ok(isValidNewBacklogId('ISSUE-007'));
		assert.ok(isValidNewBacklogId('ISSUE001'));
		assert.ok(isValidNewBacklogId('TASK_12'));
		assert.strictEqual(allocateNewBacklogId('TSK-004', ['ISSUE-001']), 'TSK-004');
		assert.strictEqual(allocateNewBacklogId('ISSUE-007', ['ISSUE-001']), 'ISSUE-007');
	});

	it('rechaza o sustituye 1, 001, I-1, AB-1, US-012', () => {
		for (const bad of ['1', '001', 'I-1', 'AB-1', 'US-012']) {
			assert.ok(!isValidNewBacklogId(bad), `${bad} must be invalid for new IDs`);
			const persisted = persistNewBacklogItem({ id: bad, title: 'n' }, []);
			assert.strictEqual(persisted.id, 'ISSUE-001', `${bad} must be replaced`);
		}
	});
});

describe('AC7 edit id without silent migration', () => {
	it('conserva id 1 si no se edita el id', () => {
		assert.strictEqual(applyEditedBacklogId('1', undefined, ['1']), '1');
		assert.strictEqual(applyEditedBacklogId('1', '1', ['1']), '1');
		assert.strictEqual(applyEditedBacklogId('1', '', ['1']), '1');
	});

	it('rechaza cambio a 2 o AB-1 y no altera el original', () => {
		assert.strictEqual(applyEditedBacklogId('1', '2', ['1']), '1');
		assert.strictEqual(applyEditedBacklogId('1', 'AB-1', ['1']), '1');
	});
});

describe('AC8 load legacy numeric ids without migration', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-ids-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('muestra id 1 tal cual y no lo renombra a ISSUE-001', () => {
		const modernDir = path.join(tmpDir, 'docs', 'ralph');
		fs.mkdirSync(modernDir, { recursive: true });
		fs.writeFileSync(path.join(modernDir, 'prd.json'), JSON.stringify({
			project: 'legacy',
			issues: [
				{ id: 1, title: 'Numeric' },
				{ id: '2', title: 'String numeric' },
			],
		}), 'utf-8');

		const prd = PrdManager.load(tmpDir)!;
		assert.strictEqual(prd.issues[0].id, '1');
		assert.strictEqual(prd.issues[1].id, '2');
		const html = getBoardContent(prd, null, {}, { autoRun: false, maxLoops: 1, guardrails: [], boundaries: [], view: 'board' });
		assert.ok(html.includes('>1<') || html.includes('data-id="1"'));
		assert.ok(!prd.issues.some(i => i.id === 'ISSUE-001'));
		const raw = PrdManager.loadRaw(tmpDir);
		assert.strictEqual(raw.issues[0].id, 1);
	});
});
