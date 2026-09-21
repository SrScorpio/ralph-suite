import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildPrompt, inferTaskType, resolveAgentProfile } from '../promptBuilders';

function task(partial: Record<string, unknown> = {}) {
	return {
		id: 'ISSUE-010',
		title: 'Ship a feature',
		description: 'plain work',
		epic: 'General',
		priority: 'P1',
		acceptanceCriteria: [],
		labels: [],
		...partial,
	};
}

function config(values: Record<string, unknown> = {}): vscode.WorkspaceConfiguration {
	return {
		get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
		update: async () => undefined,
		inspect: () => ({ workspaceValue: undefined, globalValue: undefined }),
	} as unknown as vscode.WorkspaceConfiguration;
}

function withRalphConfig(getImpl: (key: string, fallback?: unknown) => unknown, run: () => void) {
	const cfg = vscode.workspace.getConfiguration('ralph-suite') as { get: Function };
	const originalGet = cfg.get;
	const originalGetConfiguration = vscode.workspace.getConfiguration;
	const sections: Array<string | undefined> = [];
	(vscode.workspace as any).getConfiguration = (section?: string) => {
		sections.push(section);
		return originalGetConfiguration(section);
	};
	cfg.get = getImpl;
	try {
		run();
		return sections;
	} finally {
		cfg.get = originalGet;
		(vscode.workspace as any).getConfiguration = originalGetConfiguration;
	}
}

describe('inferTaskType (ADR-017)', () => {
	it('clasifica security, review, bugfix, test, docs, refactor y default por señales', () => {
		assert.strictEqual(inferTaskType(task({ title: 'Sanitize XSS and CSP' })), 'security');
		assert.strictEqual(inferTaskType(task({ description: 'rotate auth token secret' })), 'security');
		assert.strictEqual(inferTaskType(task({ labels: ['cors'] })), 'security');
		assert.strictEqual(inferTaskType(task({ title: 'Code review of the PR' })), 'review');
		assert.strictEqual(inferTaskType(task({ epic: 'audit pass' })), 'review');
		assert.strictEqual(inferTaskType(task({ title: 'Revisión del diff' })), 'review');
		assert.strictEqual(inferTaskType(task({ title: 'Fix crash regression' })), 'bugfix');
		assert.strictEqual(inferTaskType(task({ description: 'error on fail path' })), 'bugfix');
		assert.strictEqual(inferTaskType(task({ title: 'Add coverage for the spec' })), 'test');
		assert.strictEqual(inferTaskType(task({ description: 'verify the endpoint' })), 'test');
		assert.strictEqual(inferTaskType(task({ title: 'Update README manual' })), 'docs');
		assert.strictEqual(inferTaskType(task({ title: 'Refactor the architecture' })), 'refactor');
		assert.strictEqual(inferTaskType(task({ description: 'cambiar arquitectura' })), 'refactor');
		assert.strictEqual(inferTaskType(task()), 'default');
	});

	it('prioriza security sobre review cuando coinciden ambas señales', () => {
		assert.strictEqual(inferTaskType(task({ title: 'Security audit of auth' })), 'security');
	});
});

describe('resolveAgentProfile (ADR-017)', () => {
	const honestDefaults = {
		default: { engine: 'copilot', model: '', mode: 'execute' },
		bugfix: { engine: 'copilot', model: '', mode: 'execute' },
		review: { engine: 'copilot', model: '', mode: 'review' },
		security: { engine: 'copilot', model: '', mode: 'execute' },
	};

	it('cae a profiles.default para test, docs y refactor', () => {
		const cfg = config({ modelProfiles: honestDefaults, engine: 'copilot' });
		assert.deepStrictEqual(resolveAgentProfile(task({ title: 'Add unit tests' }), cfg), {
			engine: 'copilot', model: '', mode: 'execute', taskType: 'test',
		});
		assert.deepStrictEqual(resolveAgentProfile(task({ title: 'Write the docs' }), cfg), {
			engine: 'copilot', model: '', mode: 'execute', taskType: 'docs',
		});
		assert.deepStrictEqual(resolveAgentProfile(task({ title: 'Refactor helpers' }), cfg), {
			engine: 'copilot', model: '', mode: 'execute', taskType: 'refactor',
		});
	});

	it('usa el override del perfil cuando existe la clave', () => {
		const cfg = config({
			engine: 'copilot',
			modelProfiles: {
				...honestDefaults,
				bugfix: { engine: 'codex', model: 'gpt-5-codex', mode: 'execute' },
			},
		});
		const profile = resolveAgentProfile(task({ title: 'Fix the crash' }), cfg);
		assert.strictEqual(profile.taskType, 'bugfix');
		assert.strictEqual(profile.engine, 'codex');
		assert.strictEqual(profile.model, 'gpt-5-codex');
		assert.strictEqual(profile.mode, 'execute');
	});

	it('model vacío o no-string se resuelve a provider default', () => {
		const cfg = config({
			engine: 'copilot',
			modelProfiles: { default: { engine: 'copilot', model: '   ', mode: 'execute' } },
		});
		assert.strictEqual(resolveAgentProfile(task(), cfg).model, '');

		const cfgMissing = config({
			engine: 'copilot',
			modelProfiles: { default: { engine: 'copilot', mode: 'execute' } },
		});
		assert.strictEqual(resolveAgentProfile(task(), cfgMissing).model, '');
	});

	it('normaliza engine desconocido a copilot y mode inválido según taskType', () => {
		const securityCfg = config({
			engine: 'not-an-engine',
			modelProfiles: {
				security: { engine: 'warp', model: 'x', mode: 'security-audit' },
			},
		});
		const security = resolveAgentProfile(task({ title: 'Sanitize input' }), securityCfg);
		assert.strictEqual(security.taskType, 'security');
		assert.strictEqual(security.engine, 'copilot');
		assert.strictEqual(security.mode, 'execute');

		const reviewCfg = config({
			engine: 'copilot',
			modelProfiles: {
				review: { engine: 'claude', model: 'ok', mode: 'security-audit' },
			},
		});
		const review = resolveAgentProfile(task({ title: 'Review the patch' }), reviewCfg);
		assert.strictEqual(review.engine, 'claude');
		assert.strictEqual(review.mode, 'review');
	});

	it('recorta caracteres de control del model', () => {
		const cfg = config({
			engine: 'copilot',
			modelProfiles: {
				default: { engine: 'copilot', model: 'gpt\u0000-evil\n', mode: 'execute' },
			},
		});
		assert.strictEqual(resolveAgentProfile(task(), cfg).model, 'gpt-evil');
	});

	it('no lee alfred-dev.modelProfile', () => {
		const sections = withRalphConfig((key: string, fallback?: unknown) => {
			if (key === 'modelProfiles') { return honestDefaults; }
			if (key === 'engine') { return 'copilot'; }
			return fallback;
		}, () => {
			buildPrompt(task({ title: 'Ship luna terra sol palette' }), {}, undefined);
		});
		assert.ok(!sections.includes('alfred-dev'));
	});
});

describe('buildPrompt agent profile honesty (ADR-017)', () => {
	it('documenta recomendación, provider default y no interpola paleta Alfred', () => {
		withRalphConfig((key: string, fallback?: unknown) => {
			if (key === 'modelProfiles') {
				return {
					default: { engine: 'copilot', model: '', mode: 'execute' },
				};
			}
			if (key === 'engine') { return 'copilot'; }
			if (key === 'guardrails' || key === 'boundaries') { return []; }
			if (key === 'memoriesPath') { return '.agent/memories.md'; }
			return fallback;
		}, () => {
			const prompt = buildPrompt(task({ title: 'Ship a feature' }), {}, undefined);
			assert.ok(prompt.includes('## Agent Profile'));
			assert.ok(prompt.includes('**Engine:** copilot'));
			assert.ok(prompt.includes('**Recommended model:** provider default'));
			assert.ok(prompt.includes('**Mode:** execute'));
			assert.ok(prompt.includes('**Task type:** default'));
			assert.ok(/recommendation|recomendaci/i.test(prompt));
			assert.ok(!/\bluna\b/i.test(prompt));
			assert.ok(!/\bterra\b/i.test(prompt));
			assert.ok(!/\bsol\b/i.test(prompt));
			assert.ok(!prompt.includes('alfred-dev.modelProfile'));
			assert.ok(!prompt.includes('security-audit'));
		});
	});
});

describe('package.json modelProfiles contract (ADR-017)', () => {
	const root = path.join(__dirname, '../..');
	const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const nls = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
	const nlsEs = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.es.json'), 'utf8'));
	const setting = packageJson.contributes.configuration.properties['ralph-suite.modelProfiles'];
	const engine = packageJson.contributes.configuration.properties['ralph-suite.engine'];

	it('defaults honestos sin gpt-5 ni security-audit', () => {
		assert.deepStrictEqual(setting.default, {
			default: { engine: 'copilot', model: '', mode: 'execute' },
			bugfix: { engine: 'copilot', model: '', mode: 'execute' },
			review: { engine: 'copilot', model: '', mode: 'review' },
			security: { engine: 'copilot', model: '', mode: 'execute' },
		});
		const dumped = JSON.stringify(setting.default);
		assert.ok(!dumped.includes('gpt-5'));
		assert.ok(!dumped.includes('gpt-5-codex'));
		assert.ok(!dumped.includes('security-audit'));
		assert.ok(!dumped.includes('luna'));
		assert.ok(!dumped.includes('terra'));
		assert.ok(!/\bsol\b/.test(dumped));
	});

	it('esquema y NLS EN/ES describen recomendación Ralph', () => {
		assert.strictEqual(engine.description, '%config.engine.description%');
		assert.strictEqual(setting.markdownDescription || setting.description, '%config.modelProfiles.description%');
		assert.ok(nls['config.modelProfiles.description']);
		assert.ok(nlsEs['config.modelProfiles.description']);
		assert.match(nls['config.engine.description'], /recommend/i);
		assert.match(nlsEs['config.engine.description'], /recomend/i);
		assert.match(nls['config.modelProfiles.description'], /recommend/i);
		assert.ok(!/luna|terra|\bsol\b/i.test(nls['config.modelProfiles.description']) || /do not use luna/i.test(nls['config.modelProfiles.description']));
		const profileKeys = ['default', 'bugfix', 'review', 'security'];
		for (const key of profileKeys) {
			assert.deepStrictEqual(setting.properties[key].properties.engine.enum, ['copilot', 'codex', 'claude', 'opencode']);
			assert.deepStrictEqual(setting.properties[key].properties.mode.enum, ['execute', 'review']);
			assert.strictEqual(setting.properties[key].properties.model.type, 'string');
		}
		assert.ok(setting.additionalProperties);
		assert.deepStrictEqual(setting.additionalProperties.properties.mode.enum, ['execute', 'review']);
	});
});
