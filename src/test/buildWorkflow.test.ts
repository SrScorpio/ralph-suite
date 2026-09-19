import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Build workflow', () => {
	it('runs the test suite after compile and before packaging', () => {
		const workflow = fs.readFileSync(path.join(process.cwd(), '.github/workflows/build.yml'), 'utf8');
		const runSteps = workflow
			.split(/\r?\n/)
			.filter(line => line.trimStart().startsWith('- run:'))
			.map(line => line.trim().slice('- run:'.length).trim());

		const compileIndex = runSteps.indexOf('npm run compile');
		const testIndex = runSteps.indexOf('npm test');
		const packageIndex = runSteps.indexOf('npx vsce package --no-dependencies --allow-missing-repository');

		assert.ok(compileIndex >= 0, 'workflow must compile the extension');
		assert.ok(testIndex > compileIndex, 'workflow must run npm test after compile');
		assert.ok(packageIndex > testIndex, 'workflow must package after npm test');
	});
});