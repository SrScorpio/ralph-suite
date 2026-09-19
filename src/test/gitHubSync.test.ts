import * as assert from 'assert';
import { buildSyncPrompt } from '../kanban/gitHubSync';

describe('GitHub sync prompt contract', () => {
	it('uses explicit GitHub labels and preserves local IDs', () => {
		const prompt = buildSyncPrompt({
			project: 'Demo',
			description: '',
			version: '1.0.0',
			issues: [{
				id: 'LOCAL-42',
				title: 'Task',
				description: '',
				priority: 'P1',
				status: 'todo',
				acceptanceCriteria: [],
				dependencies: [],
				labels: [],
			}],
		}, 'C:/workspace');

		assert.ok(prompt.includes('github:#N'));
		assert.ok(prompt.includes('owner/repo#N'));
		assert.ok(prompt.includes('Do NOT modify prd.json'));
		assert.ok(prompt.includes('Ralph Suite ID: `<id>`'));
		assert.ok(prompt.includes('Never infer that GitHub #N is ISSUE-00N'));
		assert.ok(prompt.includes('ralph-suite.syncIssue'));
	});
});