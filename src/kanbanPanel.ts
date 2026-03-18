import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PrdManager, Issue, Prd } from './prdManager';
import { RalphStateManager, TaskLog } from './stateManager';
import { getKanbanHtml, BoardConfig } from './webview/kanbanHtml';

export class KanbanPanel {
	public static readonly viewType = 'ralph-suite.kanban';
	private static current: KanbanPanel | undefined;
	private static output: vscode.OutputChannel;

	private readonly panel: vscode.WebviewPanel;
	private readonly root:  string;
	private readonly watchers: vscode.Disposable[] = [];

	private autoRun    = false;
	private loopCount  = 0;
	private disposed   = false;
	private runnerTimer: ReturnType<typeof setTimeout> | null = null;


	private constructor(panel: vscode.WebviewPanel, root: string) {
		this.panel = panel;
		this.root  = root;
		this.panel.webview.options = { enableScripts: true };
		this.panel.onDidDispose(() => {
			// Clear current FIRST so createOrShow creates a fresh panel
			KanbanPanel.current = undefined;
			this.disposed = true;
			this.stopRunner();
			this.watchers.forEach(w => w.dispose());
		});
		this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
		this.startWatchers();
		this.render();
	}

	private startWatchers() {
		const watch = (pattern: vscode.RelativePattern, cb: () => void) => {
			const w = vscode.workspace.createFileSystemWatcher(pattern);
			w.onDidChange(cb); w.onDidCreate(cb); w.onDidDelete(cb);
			this.watchers.push(w);
		};
		watch(new vscode.RelativePattern(this.root, '.ralph/task-*-status'), () => {
			KanbanPanel.output?.appendLine('[Ralph] Status changed — refreshing');
			this.render();
			if (this.autoRun) { this.scheduleNextTask(3000); }
		});
		// Agent writes -note file → process it into log.json + memories, then delete it
		watch(new vscode.RelativePattern(this.root, '.ralph/task-*-note'), () => {
			const ralphDir = path.join(this.root, '.ralph');
			if (!fs.existsSync(ralphDir)) { return; }
			for (const f of fs.readdirSync(ralphDir)) {
				const m = f.match(/^task-(.+)-note$/);
				if (!m) { continue; }
				RalphStateManager.processNoteFile(this.root, m[1]);
				KanbanPanel.output?.appendLine(`[Ralph] Note captured for ${m[1]}`);
			}
			this.render();
		});
		watch(new vscode.RelativePattern(this.root, 'prd.json'),          () => this.render());
		watch(new vscode.RelativePattern(this.root, '.agent/memories.md'), () => this.render());
	}

	static createOrShow(extensionUri: vscode.Uri, root: string, output: vscode.OutputChannel) {
		KanbanPanel.output = output;

		if (KanbanPanel.current) {
			try {
				KanbanPanel.current.panel.reveal(vscode.ViewColumn.Beside);
				KanbanPanel.current.render();
				return;
			} catch {
				// Panel was disposed but onDidDispose hasn't fired yet — clean up manually
				try { KanbanPanel.current.watchers.forEach(w => w.dispose()); } catch { /**/ }
				KanbanPanel.current = undefined;
			}
		}

		const panel = vscode.window.createWebviewPanel(
			KanbanPanel.viewType, 'Ralph Board', vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		KanbanPanel.current = new KanbanPanel(panel, root);
	}

	static refresh() {
		if (KanbanPanel.current && !KanbanPanel.current.disposed) {
			KanbanPanel.current.render();
		}
	}

	private render() {
		if (this.disposed) { return; }
		try {
			const prd      = PrdManager.load(this.root);
			const memories = this.loadFile(path.join(this.root, '.agent', 'memories.md'));
			const logs     = this.loadLogs();
			const cfg      = this.getBoardConfig();
			this.panel.title = prd ? `${prd.project} — Board` : 'Ralph Board';
			this.panel.webview.html = getKanbanHtml(prd, memories, logs, cfg);
		} catch (e: any) {
			if (e?.message?.includes('disposed')) {
				this.disposed = true;
				KanbanPanel.current = undefined;
			} else {
				KanbanPanel.output?.appendLine(`[Ralph] Render error: ${e?.message}`);
			}
		}
	}

	private getBoardConfig(): BoardConfig {
		const s = vscode.workspace.getConfiguration('ralph-suite');
		return {
			autoRun:    this.autoRun,
			maxLoops:   s.get<number>('maxLoops', 5),
			guardrails: s.get<string[]>('guardrails', []),
			boundaries: s.get<string[]>('boundaries', []),
		};
	}

	private loadFile(p: string): string | null {
		if (!fs.existsSync(p)) { return null; }
		return fs.readFileSync(p, 'utf-8').trim() || null;
	}

	private loadLogs(): Record<string, TaskLog> {
		const map: Record<string, TaskLog> = {};
		for (const l of RalphStateManager.getAllLogs(this.root)) { map[l.id] = l; }
		return map;
	}

	// ── Runner ────────────────────────────────────────────────────────────────

	private startRunner() {
		const maxLoops = vscode.workspace.getConfiguration('ralph-suite').get<number>('maxLoops', 5);
		this.autoRun   = true;
		this.loopCount = 0;
		KanbanPanel.output?.appendLine(`[Runner] Started — max ${maxLoops} tasks`);
		vscode.window.showInformationMessage(`Ralph runner started (max ${maxLoops} tasks)`);
		this.render();
		this.runNextTask();
	}

	private stopRunner() {
		this.autoRun = false;
		if (this.runnerTimer) { clearTimeout(this.runnerTimer); this.runnerTimer = null; }
		KanbanPanel.output?.appendLine('[Runner] Stopped');
		this.render();
	}

	private scheduleNextTask(delayMs: number) {
		if (this.runnerTimer) { clearTimeout(this.runnerTimer); }
		this.runnerTimer = setTimeout(() => this.runNextTask(), delayMs);
	}

	private async runNextTask() {
		if (!this.autoRun) { return; }
		const maxLoops = vscode.workspace.getConfiguration('ralph-suite').get<number>('maxLoops', 5);
		if (this.loopCount >= maxLoops) {
			vscode.window.showInformationMessage(`Ralph runner paused after ${maxLoops} tasks. Click ⚡ to resume.`);
			this.stopRunner();
			return;
		}
		const prd = PrdManager.load(this.root);
		if (!prd) { this.stopRunner(); return; }

		const statuses = RalphStateManager.getAllStatuses(this.root);
		const inProgress = prd.issues.find(i => statuses[i.id] === 'inprogress');
		if (inProgress) {
			KanbanPanel.output?.appendLine(`[Runner] ${inProgress.id} still in progress — waiting`);
			return;
		}
		const next = PrdManager.nextPending(prd, this.root);
		if (!next) {
			vscode.window.showInformationMessage('Ralph: all tasks completed!');
			this.stopRunner();
			return;
		}
		this.loopCount++;
		KanbanPanel.output?.appendLine(`[Runner] Loop ${this.loopCount}/${maxLoops} → ${next.id}`);
		await vscode.commands.executeCommand('ralph-suite.runTask', next.id);
	}

	// ── Message handler ───────────────────────────────────────────────────────

	private async handleMessage(msg: any) {
		switch (msg.type) {

			case 'runTask':
				await vscode.commands.executeCommand('ralph-suite.runTask', msg.id);
				break;

			case 'markDone': {
				const summary = await vscode.window.showInputBox({
					title: `Done: ${msg.id}`,
					prompt: 'Brief summary (saved to project memory)',
					placeHolder: 'e.g. Created runpod/requirements.txt with pinned versions',
					ignoreFocusOut: true
				});
				RalphStateManager.setCompleted(this.root, msg.id, summary ?? undefined);
				this.render();
				if (this.autoRun) { this.scheduleNextTask(2000); }
				break;
			}

			case 'moveCard': {
				const { id, status } = msg;
				if (!id || !status) { break; }
				KanbanPanel.output?.appendLine(`[Board] Move ${id} → ${status}`);
				if (status === 'completed') {
					const summary = await vscode.window.showInputBox({
						title: `Mark done: ${id}`,
						prompt: 'Brief summary (optional)',
						placeHolder: 'What was done?',
						ignoreFocusOut: true
					});
					RalphStateManager.setCompleted(this.root, id, summary ?? undefined);
				} else if (status === 'inprogress') {
					RalphStateManager.setInProgress(this.root, id);
				} else if (status === 'todo') {
					RalphStateManager.reset(this.root, id);
				}
				this.render();
				break;
			}

			case 'addNote': {
				const note = await vscode.window.showInputBox({
					title: `Add note: ${msg.id}`,
					prompt: 'One line note — saved to log.json and memories.md',
					placeHolder: 'e.g. Fixed CORS headers, added Authorization to allowed list',
					ignoreFocusOut: true
				});
				if (!note) { break; }
				// Load log, inject note, save, append to memories
				const lp = path.join(this.root, '.ralph', `task-${msg.id}-log.json`);
				if (fs.existsSync(lp)) {
					try {
						const log = JSON.parse(fs.readFileSync(lp, 'utf-8'));
						log.note = note;
						fs.writeFileSync(lp, JSON.stringify(log, null, 2), 'utf-8');
						RalphStateManager.appendMemory(this.root, log);
					} catch { /**/ }
				}
				this.render();
				break;
			}


			case 'startRunner':
				this.startRunner();
				break;

			case 'stopRunner':
				this.stopRunner();
				vscode.window.showInformationMessage('Ralph runner stopped.');
				break;

			case 'pushToGitHub': {
				const prd = PrdManager.load(this.root);
				if (!prd) { vscode.window.showErrorMessage('No prd.json found.'); break; }
				const statuses = RalphStateManager.getAllStatuses(this.root);
				const pending = prd.issues.filter(i => {
					const s = statuses[i.id] ?? 'todo';
					return s === 'todo' || s === 'blocked';
				});
				if (!pending.length) {
					vscode.window.showInformationMessage('No pending issues to push.');
					break;
				}
				const prompt = buildPushPrompt(prd, pending);
				try {
					await vscode.commands.executeCommand('workbench.action.chat.open', {
						query: prompt, isPartialQuery: false
					});
				} catch {
					await vscode.env.clipboard.writeText(prompt);
					vscode.window.showInformationMessage('Prompt copied — paste in Copilot Chat.');
				}
				KanbanPanel.output?.appendLine(`[GitHub] Push prompt sent for ${pending.length} issues`);
				break;
			}

			case 'syncFromGitHub': {
				const prd2 = PrdManager.load(this.root);
				if (!prd2) { vscode.window.showErrorMessage('No prd.json found.'); break; }
				const prompt2 = buildSyncPrompt(prd2, this.root);
				try {
					await vscode.commands.executeCommand('workbench.action.chat.open', {
						query: prompt2, isPartialQuery: false
					});
				} catch {
					await vscode.env.clipboard.writeText(prompt2);
					vscode.window.showInformationMessage('Prompt copied — paste in Copilot Chat.');
				}
				KanbanPanel.output?.appendLine('[GitHub] Sync prompt sent');
				break;
			}

			case 'openMemories': {
				const p = path.join(this.root, '.agent', 'memories.md');
				RalphStateManager.ensure(this.root);
				if (!fs.existsSync(p)) {
					fs.writeFileSync(p, '# Project Memories\n\n> Edit freely — committed to git.\n\n', 'utf-8');
				}
				const doc = await vscode.workspace.openTextDocument(p);
				await vscode.window.showTextDocument(doc);
				break;
			}

			case 'openPrd': {
				const p = path.join(this.root, 'prd.json');
				if (fs.existsSync(p)) {
					const doc = await vscode.workspace.openTextDocument(p);
					await vscode.window.showTextDocument(doc);
				}
				break;
			}

			case 'openSettings':
				vscode.commands.executeCommand('workbench.action.openSettings', 'ralph-suite');
				break;

			case 'initProject':
				await vscode.commands.executeCommand('ralph-suite.initProject');
				break;

			case 'refresh':
				this.render();
				break;

			case 'log':
				KanbanPanel.output?.appendLine(`[Board] ${msg.text}`);
				break;
		}
	}
}

// ── GitHub prompt builders ────────────────────────────────────────────────────

function buildPushPrompt(prd: Prd, issues: Issue[]): string {
	const issueList = issues.map(i => {
		const criteria = (i.acceptanceCriteria ?? [])
			.map(ac => `  - [ ] ${ac}`).join('\n');
		const deps = i.dependencies?.length
			? `\n**Depends on:** ${i.dependencies.join(', ')}` : '';
		return [
			`### ${i.id}: ${i.title}`,
			`**Priority:** ${i.priority}${i.epic ? ` | **Epic:** ${i.epic}` : ''}`,
			`**Description:** ${i.description}`,
			criteria ? `**Acceptance Criteria:**\n${criteria}` : '',
			deps,
			`**Labels:** priority:${i.priority}${i.epic ? `, epic:${i.epic}` : ''}`,
			`> Ralph Suite ID: \`${i.id}\``,
		].filter(Boolean).join('\n');
	}).join('\n\n---\n\n');

	return [
		`Using the GitHub MCP tool, create the following GitHub Issues for project **${prd.project}**.`,
		``,
		`For each issue:`,
		`- Use the title exactly as shown`,
		`- Copy the full description and acceptance criteria into the body (format criteria as a checklist)`,
		`- Apply the labels shown (create first if missing: priority:P0=#f85149, priority:P1=#e3b341, priority:P2=#58a6ff, priority:P3=#6e7681, epic labels=#8957e5)`,
		`- Keep the line "Ralph Suite ID: \`<id>\`" at the bottom of each body for future sync`,
		`- Do NOT modify prd.json`,
		``,
		`Issues to create (${issues.length} total):`,
		``,
		issueList,
		``,
		`After creating all issues, reply with a summary: GitHub number, title, and URL for each.`,
	].join('\n');
}

function buildSyncPrompt(prd: Prd, workspaceRoot: string): string {
	const ralphDir = workspaceRoot.replace(/\\/g, '/') + '/.ralph';
	const ids = prd.issues.map(i => `\`${i.id}\``).join(', ');

	return [
		`Using the GitHub MCP tool, sync the status of GitHub Issues back to this local project.`,
		``,
		`Project: **${prd.project}**`,
		`Ralph status directory: \`${ralphDir}\``,
		`Tracked IDs: ${ids}`,
		``,
		`Steps:`,
		`1. List all GitHub Issues in this repo (open and closed)`,
		`2. For each issue containing "Ralph Suite ID:" in the body, extract the Ralph ID`,
		`3. Write status files based on GitHub Issue state:`,
		`   - **Closed** → write the text \`completed\` to \`${ralphDir}/task-<RALPH_ID>-status\``,
		`   - **Open + assigned to someone** → write \`inprogress\` to \`${ralphDir}/task-<RALPH_ID>-status\``,
		`   - **Open + unassigned** → skip, do not touch the local file`,
		`4. Use the filesystem write tool to create each status file`,
		``,
		`After syncing, confirm which files were written and their status.`,
		`Do NOT delete existing status files not found on GitHub.`,
	].join('\n');
}
