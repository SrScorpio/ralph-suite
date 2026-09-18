import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrdManager } from '../prdManager';
import { resolveWorkspaceRoot } from '../workspaceRoot';

describe('workspace root for Alfred / multi-root', () => {
	it('announces the public command contract used by Alfred Dev', () => {
		const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
		const commands = (packageJson.contributes.commands as { command: string }[]).map((entry) => entry.command);
		for (const id of [
			'ralph-suite.openKanban',
			'ralph-suite.runTask',
			'ralph-suite.startRunner',
			'ralph-suite.stopRunner',
		]) {
			assert.ok(commands.includes(id), `missing public command ${id}`);
		}
		assert.ok(!commands.includes('ralph-suite.syncIssue'));
		assert.equal(packageJson.extensionDependencies, undefined);
	});

	it('prefers the folder that contains prd.json', () => {
		const first = path.join(os.tmpdir(), 'ralph-root-a');
		const second = path.join(os.tmpdir(), 'ralph-root-b');
		const prd = PrdManager.prdPath(second, 'prd.json');
		assert.strictEqual(
			resolveWorkspaceRoot([first, second], 'prd.json', (candidate) => candidate === prd),
			second,
		);
		assert.strictEqual(resolveWorkspaceRoot([first], 'prd.json', () => false), first);
		assert.strictEqual(resolveWorkspaceRoot([], 'prd.json', () => true), undefined);
	});

	it('does not follow prdPath outside the folder', () => {
		const root = path.join(os.tmpdir(), 'ralph-root-safe');
		assert.strictEqual(PrdManager.prdPath(root, '../outside.json'), path.join(root, 'docs', 'ralph', 'prd.json'));
	});
});
