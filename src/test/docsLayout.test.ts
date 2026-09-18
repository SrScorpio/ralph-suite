import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_PRD_PATH, LEGACY_PRD_PATH, PrdManager } from '../prdManager';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import {
	buildAgentsMd,
	buildArquitecturaMd,
	buildDecisionesMd,
	buildGeneratedProjectFiles,
	buildImplementationPlanMd,
	buildInitPromptText,
	buildSeguridadMd,
	buildStatusMd,
} from '../agentsMdBuilders';

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
