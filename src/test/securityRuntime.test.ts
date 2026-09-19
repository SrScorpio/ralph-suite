import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadAndInjectContext } from '../contextInjector';
import { PrdManager } from '../prdManager';
import { RalphStateManager } from '../stateManager';

describe('Ralph runtime security contracts', () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-runtime-'));
		RalphStateManager.ensure(root);
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('preserves failed as a runtime status and exposes it in all statuses', () => {
		fs.writeFileSync(RalphStateManager.statusPath(root, 'ISSUE-001'), 'failed', 'utf-8');

		assert.strictEqual(RalphStateManager.getStatus(root, 'ISSUE-001'), 'failed');
		assert.strictEqual(RalphStateManager.getAllStatuses(root)['ISSUE-001'], 'failed');
	});

	it('does not select failed tasks as the next pending task', () => {
		const prd = {
			project: 'Test',
			description: '',
			version: '1',
			issues: [
				{ id: 'FAILED', title: 'Failed', description: '', priority: 'P0', status: 'failed', acceptanceCriteria: [], dependencies: [], labels: [] },
				{ id: 'TODO', title: 'Todo', description: '', priority: 'P1', status: 'todo', acceptanceCriteria: [], dependencies: [], labels: [] },
			],
		};

		assert.strictEqual(PrdManager.nextPending(prd as any, root)?.id, 'TODO');
	});

	it('rejects absolute and traversal memory paths outside the workspace', () => {
		const outside = path.join(path.dirname(root), 'ralph-outside-memories.md');
		fs.writeFileSync(outside, '# Outside\n\n## Project\n- Secret', 'utf-8');

		assert.strictEqual(
			loadAndInjectContext(root, 'task', [], [], undefined, outside),
			null,
		);
		assert.strictEqual(
			loadAndInjectContext(root, 'task', [], [], undefined, path.relative(root, outside)),
			null,
		);

		fs.rmSync(outside, { force: true });
	});

	it('writes configured memory paths outside the workspace only to the safe fallback', () => {
		const configured = path.join(path.dirname(root), 'ralph-configured-outside.md');
		const traversal = path.join('..', 'ralph-traversal-outside.md');
		RalphStateManager.initMemories(root, 'Goal', configured);
		RalphStateManager.initMemories(root, 'Goal', traversal);
		RalphStateManager.appendMemory(root, {
			id: 'ISSUE-001',
			title: 'Task',
			status: 'completed',
			startedAt: new Date().toISOString(),
			note: 'DECISION: Keep memory inside workspace',
		}, configured);

		assert.ok(fs.existsSync(path.join(root, '.agent', 'memories.md')));
		assert.ok(fs.readFileSync(path.join(root, '.agent', 'memories.md'), 'utf-8').includes('Keep memory inside workspace'));
		assert.ok(!fs.existsSync(configured));
		assert.ok(!fs.existsSync(path.resolve(root, traversal)));
	});

	it('does not write through a configured memory symlink outside the workspace (Windows may skip without symlink privileges)', function () {
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-memory-outside-'));
		const outsideMemory = path.join(outside, 'memories.md');
		const configuredDirectory = path.join(root, 'linked-memories');
		const configured = path.join(configuredDirectory, 'memories.md');
		fs.writeFileSync(outsideMemory, '# Outside\n', 'utf-8');
		try {
			fs.symlinkSync(outside, configuredDirectory, process.platform === 'win32' ? 'junction' : 'dir');
		} catch (error) {
			fs.rmSync(outside, { recursive: true, force: true });
			if (process.platform === 'win32') {
				this.skip();
			}
			throw error;
		}

		try {
			RalphStateManager.initMemories(root, 'Goal', configured);
			assert.ok(fs.existsSync(path.join(root, '.agent', 'memories.md')));
			assert.strictEqual(fs.readFileSync(outsideMemory, 'utf-8'), '# Outside\n');
		} finally {
			fs.rmSync(configuredDirectory, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it('does not write when .agent is a symlink outside the workspace (Windows junction test may skip without privileges)', function () {
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-agent-outside-'));
		const agentPath = path.join(root, '.agent');
		fs.rmSync(agentPath, { recursive: true, force: true });
		try {
			fs.symlinkSync(outside, agentPath, process.platform === 'win32' ? 'junction' : 'dir');
		} catch (error) {
			fs.rmSync(outside, { recursive: true, force: true });
			if (process.platform === 'win32') {
				this.skip();
			}
			throw error;
		}

		try {
			assert.throws(() => RalphStateManager.initMemories(root, 'Goal'));
			assert.strictEqual(fs.readdirSync(outside).length, 0);
		} finally {
			fs.rmSync(agentPath, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
			fs.mkdirSync(agentPath, { recursive: true });
		}
	});
});