import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrdManager } from '../prdManager';
import { resolveWorkspaceRoot } from '../workspaceRoot';

describe('workspace root for Alfred / multi-root', () => {
	it('ships package.json as version 1.11.0', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		assert.strictEqual(packageJson.version, '1.11.0');
	});

	it('announces the public command contract used by Alfred Dev', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		const commands = (packageJson.contributes.commands as { command: string }[]).map((entry) => entry.command);
		for (const id of [
			'ralph-suite.openKanban',
			'ralph-suite.runTask',
			'ralph-suite.startRunner',
			'ralph-suite.stopRunner',
			'ralph-suite.syncIssue',
		]) {
			assert.ok(commands.includes(id), `missing public command ${id}`);
		}
		assert.equal(packageJson.extensionDependencies, undefined);
	});

	it('includes public board commands in the command palette', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		const commands = (packageJson.contributes.menus.commandPalette as { command: string }[]).map((entry) => entry.command);
		assert.ok(commands.includes('ralph-suite.analyzeProject'));
		assert.ok(commands.includes('ralph-suite.syncIssue'));
	});

	it('uses localized titles for the project analysis, sync and init commands', () => {
		const root = path.join(__dirname, '../..');
		const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
		const english = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
		const spanish = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.es.json'), 'utf8'));
		const titles = Object.fromEntries((packageJson.contributes.commands as { command: string; title: string }[])
			.map((entry) => [entry.command, entry.title]));

		assert.strictEqual(titles['ralph-suite.analyzeProject'], '%command.analyzeProject.title%');
		assert.strictEqual(titles['ralph-suite.syncIssue'], '%command.syncIssue.title%');
		assert.strictEqual(titles['ralph-suite.initProject'], '%command.initProject.title%');
		assert.strictEqual(english['command.analyzeProject.title'], 'Ralph: Analyze Existing Project');
		assert.strictEqual(english['command.syncIssue.title'], 'Ralph: Sync GitHub Issue Status');
		assert.strictEqual(english['command.initProject.title'], 'Ralph: Start New Project');
		assert.strictEqual(spanish['command.analyzeProject.title'], 'Ralph: Analizar proyecto existente');
		assert.strictEqual(spanish['command.syncIssue.title'], 'Ralph: Sincronizar estado de issue GitHub');
		assert.strictEqual(spanish['command.initProject.title'], 'Ralph: Iniciar proyecto nuevo');
	});

	it('prefers the folder that contains prd.json', () => {
		const first = path.join(os.tmpdir(), 'ralph-root-a');
		const second = path.join(os.tmpdir(), 'ralph-root-b');
		const prd = PrdManager.prdPath(second, 'prd.json');
		assert.strictEqual(
			resolveWorkspaceRoot([first, second], 'prd.json', (candidate) => candidate === prd),
			second,
		);
		assert.strictEqual(resolveWorkspaceRoot([], 'prd.json', () => true), undefined);
	});

	it('falls back to the first folder when no folder contains prd.json', () => {
		const first = path.join(os.tmpdir(), 'ralph-root-without-prd');
		assert.strictEqual(resolveWorkspaceRoot([first], 'prd.json', () => false), first);
	});

	it('does not follow prdPath outside the folder', () => {
		const root = path.join(os.tmpdir(), 'ralph-root-safe');
		assert.strictEqual(PrdManager.prdPath(root, '../outside.json'), path.join(root, 'docs', 'ralph', 'prd.json'));
	});
});
