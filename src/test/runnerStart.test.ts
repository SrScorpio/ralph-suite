import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { runnerStopMessage } from '../commands/task';
import { existingAgentsChoice, setupProject } from '../commands/project';
import { getBoardContent } from '../webview/kanbanHtml';

describe('ISSUE-004 runner start and existing AGENTS.md', () => {
	const prd = {
		project: 'Demo',
		description: '',
		version: '1.0.0',
		issues: [{ id: 'ISSUE-001', title: 'Busy', description: '', status: 'inprogress', priority: 'P1', epic: 'General', dependencies: [], acceptanceCriteria: [] }],
	};

	it('explains on the board why auto-run stopped without an eligible task', () => {
		for (const reason of ['no-prd', 'in-progress', 'none-eligible'] as const) {
			assert.match(runnerStopMessage(reason, 'es'), /no ha lanzado/);
		}
		const html = getBoardContent(prd as any, null, {}, {
			autoRun: false,
			maxLoops: 1,
			guardrails: [],
			boundaries: [],
			view: 'board',
			locale: 'es',
			runnerNotice: runnerStopMessage('none-eligible', 'es'),
		});
		assert.match(html, /runner-notice/);
		assert.match(html, /No hay ninguna tarea elegible/);
		assert.match(html, /⚙ AGENTS\.md/);
		assert.doesNotMatch(html, /⚙ Agents</);
	});

	it('does not generate anything when AGENTS.md already exists and the choice is dismissed', async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-agents-'));
		const agentsPath = path.join(root, 'AGENTS.md');
		fs.writeFileSync(agentsPath, '# existing\n', 'utf-8');
		const messages: string[] = [];
		const original = {
			workspaceFolders: vscode.workspace.workspaceFolders,
			showInformationMessage: vscode.window.showInformationMessage,
			getConfiguration: vscode.workspace.getConfiguration,
		};
		(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: root } }];
		(vscode.workspace as any).getConfiguration = () => ({ get: (_key: string, fallback?: unknown) => fallback });
		(vscode.window as any).showInformationMessage = async () => undefined;
		try {
			await setupProject({ appendLine: (line: string) => messages.push(line) } as any);
			assert.strictEqual(fs.readFileSync(agentsPath, 'utf-8'), '# existing\n');
			assert.ok(messages.some(line => line.includes('already exists')));
			assert.strictEqual(await existingAgentsChoice(), undefined);
		} finally {
			(vscode.workspace as any).workspaceFolders = original.workspaceFolders;
			(vscode.window as any).showInformationMessage = original.showInformationMessage;
			(vscode.workspace as any).getConfiguration = original.getConfiguration;
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});