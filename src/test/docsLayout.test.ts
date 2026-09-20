import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_PRD_PATH, LEGACY_PRD_PATH, PrdManager, countRecognizedItems, prdWatchPattern } from '../prdManager';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import {
	buildAgentsMd,
	buildArquitecturaMd,
	buildCopilotInstructions,
	buildDecisionesMd,
	buildGeneratedProjectFiles,
	buildImplementationPlanMd,
	buildInitPromptText,
	buildSeguridadMd,
	buildStatusMd,
} from '../agentsMdBuilders';
import { buildPrompt, RalphExecutionContext } from '../promptBuilders';

function makeTmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-docs-layout-'));
}

describe('ISSUE-003 docs/ layout and docs/ralph/prd.json', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = makeTmp();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('announces docs/ralph/prd.json as the package default', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		assert.strictEqual(packageJson.contributes.configuration.properties['ralph-suite.prdPath'].default, DEFAULT_PRD_PATH);
		const setup = (packageJson.contributes.commands as { command: string; title: string }[])
			.find((entry) => entry.command === 'ralph-suite.setupProject');
		assert.ok(setup?.title.includes('docs/'));
		assert.ok(!setup?.title.includes('plans/'));
	});

	it('resolves the new default path inside the workspace and rejects traversal', () => {
		assert.strictEqual(DEFAULT_PRD_PATH, 'docs/ralph/prd.json');
		assert.strictEqual(
			PrdManager.prdPath(tmpDir),
			path.join(tmpDir, 'docs', 'ralph', 'prd.json'),
		);
		assert.strictEqual(
			PrdManager.prdPath(tmpDir, ''),
			path.join(tmpDir, 'docs', 'ralph', 'prd.json'),
		);
		assert.strictEqual(
			PrdManager.prdPath(tmpDir, '../outside.json'),
			path.join(tmpDir, 'docs', 'ralph', 'prd.json'),
		);
		assert.ok(!PrdManager.prdPath(tmpDir, '../outside.json').includes(`..${path.sep}`));
	});

	it('builds a RelativePattern glob with forward slashes only', () => {
		const defaultGlob = prdWatchPattern(tmpDir);
		assert.strictEqual(defaultGlob, 'docs/ralph/prd.json');
		assert.ok(!defaultGlob.includes('\\'), `default glob must not contain backslashes: ${defaultGlob}`);

		const customGlob = prdWatchPattern(tmpDir, 'backlog\\nested\\prd.json');
		assert.strictEqual(customGlob, 'backlog/nested/prd.json');
		assert.ok(!customGlob.includes('\\'), `custom glob must not contain backslashes: ${customGlob}`);

		const winRoot = 'C:\\Users\\dev\\project';
		const winGlob = prdWatchPattern(winRoot);
		assert.strictEqual(winGlob, 'docs/ralph/prd.json');
		assert.ok(!winGlob.includes('\\'), `windows-root glob must not contain backslashes: ${winGlob}`);
	});

	it('honours a custom prdPath inside the workspace', () => {
		assert.strictEqual(
			PrdManager.prdPath(tmpDir, 'backlog/custom.json'),
			path.join(tmpDir, 'backlog', 'custom.json'),
		);
		fs.writeFileSync(path.join(tmpDir, LEGACY_PRD_PATH), JSON.stringify({
			project: 'legacy-root',
			issues: [],
		}), 'utf-8');
		assert.strictEqual(
			PrdManager.prdPath(tmpDir, 'backlog/custom.json'),
			path.join(tmpDir, 'backlog', 'custom.json'),
		);
		assert.strictEqual(PrdManager.load(tmpDir, 'backlog/custom.json'), null);
	});

	it('falls back to root prd.json when the new default path is absent', () => {
		fs.writeFileSync(path.join(tmpDir, LEGACY_PRD_PATH), JSON.stringify({
			project: 'legacy-root',
			issues: [{ id: 'ISSUE-001', title: 'Old' }],
		}), 'utf-8');

		assert.strictEqual(PrdManager.prdPath(tmpDir), path.join(tmpDir, LEGACY_PRD_PATH));
		assert.strictEqual(PrdManager.load(tmpDir)!.project, 'legacy-root');
		assert.ok(!fs.existsSync(path.join(tmpDir, 'docs', 'ralph', 'prd.json')));
	});

	it('uses docs/ralph/prd.json when it exists and does not merge a root PRD', () => {
		const modernDir = path.join(tmpDir, 'docs', 'ralph');
		fs.mkdirSync(modernDir, { recursive: true });
		fs.writeFileSync(path.join(modernDir, 'prd.json'), JSON.stringify({
			project: 'modern',
			issues: [{ id: 'ISSUE-001', title: 'New' }],
		}), 'utf-8');
		fs.writeFileSync(path.join(tmpDir, LEGACY_PRD_PATH), JSON.stringify({
			project: 'legacy-root',
			issues: [{ id: 'ISSUE-099', title: 'Should not merge' }],
		}), 'utf-8');

		assert.strictEqual(PrdManager.prdPath(tmpDir), path.join(modernDir, 'prd.json'));
		const prd = PrdManager.load(tmpDir)!;
		assert.strictEqual(prd.project, 'modern');
		assert.strictEqual(prd.issues.length, 1);
		assert.strictEqual(prd.issues[0].id, 'ISSUE-001');
		const leftover = JSON.parse(fs.readFileSync(path.join(tmpDir, LEGACY_PRD_PATH), 'utf-8'));
		assert.strictEqual(leftover.project, 'legacy-root');
	});

	it('uses the legacy PRD when the modern PRD exists but has no issues', () => {
		const modernDir = path.join(tmpDir, 'docs', 'ralph');
		fs.mkdirSync(modernDir, { recursive: true });
		fs.writeFileSync(path.join(modernDir, 'prd.json'), JSON.stringify({ project: 'modern', issues: [] }), 'utf-8');
		fs.writeFileSync(path.join(tmpDir, LEGACY_PRD_PATH), JSON.stringify({
			project: 'legacy-root',
			issues: [{ id: 'ISSUE-001', title: 'Legacy issue' }],
		}), 'utf-8');

		assert.strictEqual(countRecognizedItems({ issues: [] }), 0);
		assert.strictEqual(countRecognizedItems({ tasks: [{ id: 'ISSUE-001' }] }), 1);
		assert.strictEqual(PrdManager.prdPath(tmpDir), path.join(tmpDir, LEGACY_PRD_PATH));
		assert.strictEqual(PrdManager.load(tmpDir)!.issues[0].id, 'ISSUE-001');
	});

	it('loads tasks, items, and stories when issues and userStories are absent', () => {
		for (const key of ['tasks', 'items', 'stories']) {
			const raw = { [key]: [{ id: `ISSUE-${key}`, title: key }] };
			fs.writeFileSync(path.join(tmpDir, LEGACY_PRD_PATH), JSON.stringify(raw), 'utf-8');
			assert.strictEqual(PrdManager.load(tmpDir)!.issues[0].id, `ISSUE-${key}`);
		}
	});

	it('creates docs/ralph when saving a new PRD at the default path', () => {
		PrdManager.saveRaw(tmpDir, {
			project: 'fresh',
			issues: [{ id: 'ISSUE-001', title: 'One' }],
		});
		const saved = path.join(tmpDir, 'docs', 'ralph', 'prd.json');
		assert.ok(fs.existsSync(saved));
		assert.strictEqual(JSON.parse(fs.readFileSync(saved, 'utf-8')).project, 'fresh');
	});

	it('prefers the multi-root folder that has docs/ralph/prd.json', () => {
		const first = makeTmp();
		const second = makeTmp();
		try {
			fs.mkdirSync(path.join(second, 'docs', 'ralph'), { recursive: true });
			fs.writeFileSync(path.join(second, 'docs', 'ralph', 'prd.json'), JSON.stringify({
				project: 'winner',
				issues: [],
			}), 'utf-8');
			assert.strictEqual(resolveWorkspaceRoot([first, second]), second);
		} finally {
			fs.rmSync(first, { recursive: true, force: true });
			fs.rmSync(second, { recursive: true, force: true });
		}
	});

	it('prefers a multi-root folder with legacy root prd.json over a folder without a PRD', () => {
		const first = makeTmp();
		const second = makeTmp();
		try {
			fs.writeFileSync(path.join(second, LEGACY_PRD_PATH), JSON.stringify({
				project: 'legacy-winner',
				issues: [],
			}), 'utf-8');
			assert.strictEqual(resolveWorkspaceRoot([first, second]), second);
		} finally {
			fs.rmSync(first, { recursive: true, force: true });
			fs.rmSync(second, { recursive: true, force: true });
		}
	});

	it('generated AGENTS.md lists docs/project/* and docs/ralph/prd.json, not plans/ as primary', () => {
		const md = buildAgentsMd(
			'Senior Software Engineer',
			'TypeScript',
			'Demo',
			[],
			[],
			'2026-09-18',
		);
		assert.ok(md.includes('docs/project/architecture.md'));
		assert.ok(md.includes('docs/project/threat-model.md'));
		assert.ok(md.includes('docs/adr/'));
		assert.ok(md.includes('docs/ralph/prd.json'));
		const before = md.slice(md.indexOf('## Before starting any task, read:'));
		const beforeSection = before.slice(0, before.indexOf('## Completion protocol'));
		assert.ok(!beforeSection.includes('plans/'), 'plans/ must not be the primary read list');
		assert.ok(!md.includes('docs/progress.md'));
	});

	it('generated instructions distinguish collaborative references from local Ralph IDs', () => {
		const md = buildAgentsMd(
			'Senior Software Engineer',
			'TypeScript',
			'Demo',
			[],
			[],
			'2026-09-18',
		);
		const copilot = buildCopilotInstructions('Demo', 'TypeScript');
		const init = buildInitPromptText('ship a plugin', tmpDir, [], []);
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		const guardrails = packageJson.contributes.configuration.properties['ralph-suite.guardrails'].default as string[];

		assert.ok(md.includes('owner/repo#N'));
		assert.ok(md.includes('syncIssue'));
		assert.ok(md.includes('github:#N'));
		assert.ok(md.includes('explicit Ralph task ID and workspace root'));
		assert.ok(md.includes('Ad hoc, analysis, review, documentation, and handoff requests do not require an ID'));
		assert.ok(md.includes('Only authorized commits'));
		assert.ok(copilot.includes('owner/repo#N'));
		assert.ok(copilot.includes('syncIssue'));
		assert.ok(copilot.includes('github:#N'));
		assert.ok(copilot.includes('Commits only when explicitly authorized'));
		assert.ok(init.includes('Use the backlog ID exactly as provided'));
		assert.ok(init.includes('syncIssue'));
		assert.ok(init.includes('github:#N'));
		assert.ok(init.includes('Do not infer a GitHub issue number from a local ID'));
		assert.ok(!init.includes('add git commit after each feature issue'));
		assert.ok(!guardrails.some(rule => rule.includes('When a task is finished, write the completion signal')));
		assert.ok(guardrails.some(rule => rule.includes('Only authorized commits')));
	});

	it('buildPrompt gates completion signals on explicit Ralph context and quality checks', () => {
		const task = {
			id: 'LOCAL-42',
			title: 'Prompt regression',
			description: 'Verify completion instructions',
			priority: 'P1',
			acceptanceCriteria: [],
		};
		const context: RalphExecutionContext = {
			kind: 'ralph-execution',
			localTaskId: task.id,
			workspaceRoot: tmpDir,
		};
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];
		const prompt = buildPrompt(task, {}, context);

		assert.ok(prompt.includes('COMPLETION SIGNALS'));
		assert.ok(prompt.includes('Use the local backlog ID exactly as provided: LOCAL-42'));
		assert.ok(prompt.includes('only after the full task scope, verification commands, and quality gates are complete'));
		assert.ok(prompt.includes('Never write completion signals during rejection, blocking, review, or partial handoff'));
		assert.ok(prompt.includes('overwrite, not append'));
		assert.ok(prompt.includes('NOTA: <one line summary>'));
		assert.ok(!prompt.includes('Do NOT skip either step'));

		const invalidContexts: unknown[] = [
			undefined,
			{ kind: 'ad-hoc', localTaskId: task.id, workspaceRoot: tmpDir },
			{ kind: 'ralph-execution', localTaskId: 'OTHER-42', workspaceRoot: tmpDir },
			{ kind: 'ralph-execution', localTaskId: '', workspaceRoot: tmpDir },
			{ kind: 'ralph-execution', localTaskId: '   ', workspaceRoot: tmpDir },
			{ kind: 'ralph-execution', localTaskId: task.id, workspaceRoot: '   ' },
		];

		try {
			for (const context of invalidContexts) {
				const invalidPrompt = buildPrompt(task, {}, context);
				assert.ok(!invalidPrompt.includes('.ralph/'));
				assert.ok(!invalidPrompt.includes('completed'));
				assert.ok(!invalidPrompt.includes('NOTA:'));
				assert.ok(!invalidPrompt.includes('COMPLETION SIGNALS'));
			}
		} finally {
			(vscode.workspace as any).workspaceFolders = previousFolders;
		}
	});

	it('rejects Ralph execution contexts outside canonical workspace folders', () => {
		const task = {
			id: 'LOCAL-43',
			title: 'Workspace boundary',
			description: 'Check execution context boundaries',
			priority: 'P1',
			acceptanceCriteria: [],
		};
		const previousFolders = (vscode.workspace as any).workspaceFolders;
		const outside = makeTmp();
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: tmpDir } }];
		try {
			const prompt = buildPrompt(task, {}, {
				kind: 'ralph-execution',
				localTaskId: task.id,
				workspaceRoot: outside,
			});
			assert.ok(!prompt.includes('COMPLETION SIGNALS'));
			assert.ok(!prompt.includes('.ralph/'));
		} finally {
			(vscode.workspace as any).workspaceFolders = previousFolders;
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it('generated docs templates use docs/ and never write progress.md under docs/', () => {
		const architecture = buildArquitecturaMd('Demo', 'TypeScript', '2026-09-18');
		const threat = buildSeguridadMd('Demo', '2026-09-18');
		const adr = buildDecisionesMd('Demo', '2026-09-18');
		const status = buildStatusMd('Demo', '2026-09-18');
		const impl = buildImplementationPlanMd('Demo');
		const init = buildInitPromptText('ship a plugin', tmpDir, [], []);
		for (const text of [architecture, threat, adr, status, impl, init]) {
			assert.ok(!text.includes('docs/progress.md'), 'progress.md must not be written under docs/');
			assert.ok(!/write[^\n]*docs\/[^\n]*progress\.md/i.test(text));
		}
		assert.ok(adr.includes('docs/'), 'ADR starter should name docs/ as the convention');
		assert.ok(!adr.includes('plans/'));
		assert.ok(init.includes('docs/project/architecture.md'));
		assert.ok(init.includes('docs/ralph/prd.json'));
		assert.ok(!init.includes('plans/arquitectura.md'));
		assert.ok(impl.includes('does not replace prd.json') || impl.includes('does not replace `prd.json`'));

		const files = buildGeneratedProjectFiles(
			'Senior Software Engineer',
			'TypeScript',
			'Demo',
			[],
			[],
			'2026-09-18',
		);
		const rels = files.map(f => f.path.replace(/\\/g, '/'));
		assert.ok(rels.includes('AGENTS.md'));
		assert.ok(rels.includes('.github/copilot-instructions.md'));
		assert.ok(rels.includes('docs/project/architecture.md'));
		assert.ok(rels.includes('docs/project/threat-model.md'));
		assert.ok(rels.includes('docs/project/status.md'));
		assert.ok(rels.includes('docs/adr/ADR-001-project-setup.md'));
		assert.ok(rels.includes('docs/ralph/IMPLEMENTATION_PLAN.md'));
		assert.ok(!rels.some(p => p.startsWith('plans/')));
		assert.ok(!rels.includes('docs/progress.md'));
		assert.ok(!rels.includes('prd.json'));
	});
});
