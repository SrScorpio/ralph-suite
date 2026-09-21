import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = process.cwd();

/** Patterns from SrScorpio/ralph-suite#12 / main `.gitignore`. */
const MUST_IGNORE = [
	'node_modules/',
	'dist/',
	'.vscode-test/',
	'out/',
	'*.js.map',
	'*.vsix',
	'compiled/',
	'_p13.py',
	'_patch_*.py',
	'_t.py',
	'_watch.js',
	'.ralph/',
	'src/.DS_Store',
	'.DS_Store',
	'.agent/',
	'memories.md',
	'prd.json',
];

/** Product contract files that must stay versioned (ralph-suite#12). */
const MUST_NOT_IGNORE = [
	'AGENTS.md',
	'.github/',
	'docs/',
	'plans/',
	'src/',
	'package.json',
	'README.md',
	'CHANGELOG.md',
	'example-prd.json',
];

function readText(rel: string): string {
	return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function gitignoreRules(content: string): string[] {
	return content
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0 && !line.startsWith('#'));
}

function patternToRegex(pattern: string): RegExp {
	const isDir = pattern.endsWith('/');
	const body = (isDir ? pattern.slice(0, -1) : pattern)
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '[^/]*');
	if (isDir) {
		return new RegExp(`^(?:.+/)?${body}(?:/|$)`);
	}
	if (pattern.includes('/')) {
		return new RegExp(`^${body}$`);
	}
	return new RegExp(`(?:^|/)${body}$`);
}

function matchesIgnore(file: string, pattern: string): boolean {
	return patternToRegex(pattern).test(file.replace(/\\/g, '/'));
}

function trackedFiles(): string[] {
	const result = spawnSync('git', ['ls-files', '-z'], {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		shell: false,
	});
	assert.strictEqual(result.status, 0, `git ls-files failed: ${result.stderr || result.error?.message}`);
	return result.stdout.split('\0').filter(Boolean);
}

describe('ralph-suite#12 repo ignore contract', () => {
	it('keeps the published ignore list and does not ignore product contract files', () => {
		const rules = gitignoreRules(readText('.gitignore'));

		for (const pattern of MUST_IGNORE) {
			assert.ok(rules.includes(pattern), `.gitignore must include ${pattern}`);
		}

		for (const protectedPath of MUST_NOT_IGNORE) {
			assert.ok(
				!rules.includes(protectedPath),
				`.gitignore must not ignore product path ${protectedPath}`,
			);
		}
	});

	it('does not track any path matching the published ignore list', () => {
		const files = trackedFiles();
		assert.ok(files.length > 0, 'git ls-files must return the published tree');

		const leaked = files.filter(file => MUST_IGNORE.some(pattern => matchesIgnore(file, pattern)));
		assert.deepStrictEqual(leaked, [], `tracked files match .gitignore: ${leaked.join(', ')}`);

		for (const protectedPath of MUST_NOT_IGNORE) {
			const present = files.some(file => {
				const normalized = file.replace(/\\/g, '/');
				if (protectedPath.endsWith('/')) {
					return normalized === protectedPath.slice(0, -1) || normalized.startsWith(protectedPath);
				}
				return normalized === protectedPath;
			});
			assert.ok(present, `product path must stay tracked: ${protectedPath}`);
		}
	});

	it('excludes packaging junk from the VSIX without dropping dist/', () => {
		const vscodeignore = gitignoreRules(readText('.vscodeignore'));
		const hasVsix = vscodeignore.some(rule => rule === '*.vsix' || rule === '**/*.vsix');
		assert.ok(hasVsix, '.vscodeignore must exclude *.vsix');
		assert.ok(
			vscodeignore.includes('**/*.map') || vscodeignore.includes('*.js.map') || vscodeignore.includes('**/*.js.map'),
			'.vscodeignore must exclude sourcemaps',
		);
		assert.ok(
			vscodeignore.some(rule => rule === '.ralph/**' || rule === '.ralph/'),
			'.vscodeignore must exclude .ralph/',
		);
		assert.ok(
			!vscodeignore.includes('dist/') && !vscodeignore.includes('dist/**'),
			'.vscodeignore must not exclude dist/ (package.json main is ./dist/extension.js)',
		);

		const workflow = readText('.github/workflows/build.yml');
		assert.ok(workflow.includes('*.vsix'), 'CI must treat the VSIX as a build artifact');
		assert.ok(workflow.includes('upload-artifact'), 'CI must upload the VSIX instead of committing it');
		assert.ok(!/git\s+add[^\n]*\*\.vsix/.test(workflow), 'CI must not git add *.vsix');
		assert.ok(!/git\s+add[^\n]*dist\//.test(workflow), 'CI must not git add dist/');
		assert.ok(
			workflow.includes('git ls-files -c -i --exclude-standard'),
			'CI must fail if gitignored files are tracked',
		);
	});
});
