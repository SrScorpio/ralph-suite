import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PrdManager, Issue, Prd } from './prdManager';
import { RalphStateManager, TaskLog } from './stateManager';
import { getShellHtml, getBoardContent, BoardConfig } from './webview/kanbanHtml';

export class KanbanPanel {
	public static readonly viewType = 'ralph-suite.kanban';
	private static current: KanbanPanel | undefined;
	private static output: vscode.OutputChannel;

	private readonly panel: vscode.WebviewPanel;
	private readonly root:  string;
	private readonly watchers: vscode.Disposable[] = [];

	private autoRun    = false;
	private loopCount  = 0;
	private completedSinceOptimize = 0;  // tracks tasks completed since last memory optimization
	private disposed   = false;
	private runnerTimer: ReturnType<typeof setTimeout> | null = null;
	private currentView: 'board' | 'epic' | 'history' = 'board';


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
		this.panel.webview.onDidReceiveMessage(msg => {
			// Fire async handler without awaiting — each message is independent
			this.handleMessage(msg).catch(e => {
				KanbanPanel.output?.appendLine(`[Board] Handler error for ${msg?.type}: ${e}`);
			});
		});
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
			if (this.autoRun) {
				// Check if a task just completed and if memory optimization is due
				this.checkAutoOptimize().then(() => {
					this.scheduleNextTask(3000);
				});
			}
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

	// Send a message to the webview from outside (e.g. quick menu)
	static sendMessage(type: string, id?: string) {
		if (KanbanPanel.current && !KanbanPanel.current.disposed) {
			KanbanPanel.current.handleMessage({ type, id });
		}
	}

	private shellLoaded = false;

	private render() {
		if (this.disposed) { return; }
		try {
			const prd      = PrdManager.load(this.root);
			const memories = this.loadFile(path.join(this.root, '.agent', 'memories.md'));
			const logs     = this.loadLogs();
			const cfg      = this.getBoardConfig();
			this.panel.title = prd ? `${prd.project} — Board` : 'Ralph Board';

			// Load shell HTML only once — subsequent renders use postMessage
			if (!this.shellLoaded) {
				this.panel.webview.html = getShellHtml();
				this.shellLoaded = true;
				// Small delay to let the shell initialize before sending data
				setTimeout(() => this.sendUpdate(prd, memories, logs, cfg), 100);
			} else {
				this.sendUpdate(prd, memories, logs, cfg);
			}
		} catch (e: any) {
			if (e?.message?.includes('disposed')) {
				this.disposed = true;
				KanbanPanel.current = undefined;
			} else {
				KanbanPanel.output?.appendLine(`[Ralph] Render error: ${e?.message}`);
			}
		}
	}

	private sendUpdate(prd: any, memories: string | null, logs: any, cfg: BoardConfig) {
		if (this.disposed) { return; }
		try {
			const html = getBoardContent(prd, memories, logs, cfg);
			this.panel.webview.postMessage({ type: 'update', data: { html } });
		} catch (e: any) {
			if (e?.message?.includes('disposed')) {
				this.disposed = true;
				KanbanPanel.current = undefined;
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
			view:       this.currentView,
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

	private async checkAutoOptimize(): Promise<void> {
		const cfg          = vscode.workspace.getConfiguration('ralph-suite');
		const optimizeEvery = cfg.get<number>('memoryOptimizeEvery', 0);
		if (optimizeEvery <= 0) { return; }

		// Count completed tasks
		const prd = PrdManager.load(this.root);
		if (!prd) { return; }
		const statuses   = RalphStateManager.getAllStatuses(this.root);
		const totalDone  = prd.issues.filter(i => (statuses[i.id] ?? 'todo') === 'completed').length;

		// Trigger if total completed is a multiple of optimizeEvery
		// and we haven't already triggered at this count
		if (totalDone > 0 && totalDone % optimizeEvery === 0 && totalDone !== this.completedSinceOptimize) {
			this.completedSinceOptimize = totalDone;
			KanbanPanel.output?.appendLine(`[Memory] Auto-optimize triggered after ${totalDone} completed tasks`);
			vscode.window.showInformationMessage(`Ralph: optimizing memories.md after ${totalDone} completed tasks…`);
			// Import here to avoid circular — call via command
			await vscode.commands.executeCommand('ralph-suite.optimizeMemory');
			// Wait a bit for the optimization to be sent to chat before next task
			await new Promise(r => setTimeout(r, 2000));
		}
	}

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
					const prdIP = PrdManager.load(this.root);
					const titleIP = prdIP?.issues.find(i => i.id === id)?.title ?? '';
					RalphStateManager.setInProgress(this.root, id, titleIP);
				} else if (status === 'todo') {
					RalphStateManager.reset(this.root, id);
				}
				this.render();
				break;
			}

			case 'reorderCard': {
				const { id, targetId, before } = msg;
				if (!id || !targetId) { break; }
				const prdPathR = path.join(this.root, 'prd.json');
				if (!fs.existsSync(prdPathR)) { break; }
				try {
					const raw   = JSON.parse(fs.readFileSync(prdPathR, 'utf-8'));
					const items: any[] = raw.issues ?? raw.userStories ?? [];
					const fromIdx = items.findIndex((i: any) => i.id === id);
					const toIdx   = items.findIndex((i: any) => i.id === targetId);
					if (fromIdx === -1 || toIdx === -1) { break; }
					const [moved] = items.splice(fromIdx, 1);
					const insertAt = before
						? (fromIdx < toIdx ? toIdx - 1 : toIdx)
						: (fromIdx < toIdx ? toIdx : toIdx + 1);
					items.splice(Math.max(0, insertAt), 0, moved);
					if (raw.issues)            { raw.issues = items; }
					else if (raw.userStories)  { raw.userStories = items; }
					fs.writeFileSync(prdPathR, JSON.stringify(raw, null, 2), 'utf-8');
					this.render();
				} catch (e) {
					KanbanPanel.output?.appendLine(`[Board] Reorder failed: ${e}`);
				}
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

			case 'setView':
				if (msg.id === 'board' || msg.id === 'epic' || msg.id === 'history') {
					this.currentView = msg.id;
					this.render();
				}
				break;

			case 'showAddIssue':
				// Post back to webview to open the modal client-side
				this.panel.webview.postMessage({ type: 'openAddModal' });
				break;

			case 'showEditIssue': {
				// Send full issue data to webview for the edit modal
				const prdE = PrdManager.load(this.root);
				const issue = prdE?.issues.find(i => i.id === msg.id);
				if (issue) {
					this.panel.webview.postMessage({ type: 'openEditModal', issue });
				}
				break;
			}

			case 'editIssue': {
				// Save edited issue back to prd.json
				const { id, fields } = msg;
				if (!id || !fields) { break; }
				const prdPathE = path.join(this.root, 'prd.json');
				if (!fs.existsSync(prdPathE)) { break; }
				try {
					const raw   = JSON.parse(fs.readFileSync(prdPathE, 'utf-8'));
					const items = raw.issues ?? raw.userStories ?? [];
					const idx   = items.findIndex((i: any) => i.id === id);
					if (idx === -1) { break; }
					// Merge fields — only update what was sent
					items[idx] = { ...items[idx], ...fields };
					if (raw.issues)      { raw.issues = items; }
					else if (raw.userStories) { raw.userStories = items; }
					fs.writeFileSync(prdPathE, JSON.stringify(raw, null, 2), 'utf-8');
					this.render();
					KanbanPanel.output?.appendLine(`[Board] Edited issue ${id}`);
				} catch (e) {
					KanbanPanel.output?.appendLine(`[Board] Edit failed: ${e}`);
				}
				break;
			}

			case 'addIssue': {
				const prd = PrdManager.load(this.root);
				if (!prd) { vscode.window.showErrorMessage('No prd.json found.'); break; }

				const prdPath = path.join(this.root, 'prd.json');
				const raw     = JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
				const items   = raw.issues ?? raw.userStories ?? [];

				// Generate next ID based on existing format
				const existingIds: string[] = items.map((i: any) => i.id ?? '');
				const newId = generateNextId(existingIds);

				const newIssue = {
					id:                 newId,
					title:              msg.issue.title,
					description:        msg.issue.description ?? '',
					epic:               msg.issue.epic,
					priority:           msg.issue.priority ?? 'P2',
					status:             'todo',
					acceptanceCriteria: msg.issue.acceptanceCriteria ?? [],
					dependencies:       [],
					labels:             msg.issue.labels ?? [],
				};

				items.push(newIssue);
				if (raw.issues)      { raw.issues = items; }
				else if (raw.userStories) { raw.userStories = items; }
				else                 { raw.issues = items; }

				fs.writeFileSync(prdPath, JSON.stringify(raw, null, 2), 'utf-8');
				KanbanPanel.output?.appendLine(`[Board] Added issue ${newId}: ${newIssue.title}`);
				this.render();
				break;
			}

			case 'addFromChat': {
				const prd2    = PrdManager.load(this.root);
				const prdPath2 = path.join(this.root, 'prd.json');
				const prompt  = buildAddFromChatPrompt(prd2, prdPath2);
				try {
					await vscode.commands.executeCommand('workbench.action.chat.open', {
						query: prompt, isPartialQuery: false
					});
				} catch {
					await vscode.env.clipboard.writeText(prompt);
					vscode.window.showInformationMessage('Prompt copied — paste in Copilot Chat.');
				}
				break;
			}

			case 'importPlan': {
				KanbanPanel.output?.appendLine('[Board] importPlan button clicked');
				const activeDoc = vscode.window.activeTextEditor?.document;
				KanbanPanel.output?.appendLine(`[Board] activeDoc: ${activeDoc?.fileName ?? 'none'}`);
				let planText: string | undefined;
				if (activeDoc && (activeDoc.languageId === 'markdown' || activeDoc.fileName.endsWith('.md') || activeDoc.fileName.includes('.prompt'))) {
					planText = activeDoc.getText();
				} else {
					const uris = await vscode.window.showOpenDialog({ title: 'Select Plan markdown', canSelectMany: false, filters: { 'Markdown': ['md'], 'All Files': ['*'] }, openLabel: 'Import Plan' });
					if (uris?.length) { planText = fs.readFileSync(uris[0].fsPath, 'utf-8'); }
				}
				if (!planText) { break; }
				const imported = importPlanToPrd(planText);
				if (!imported || !imported.issues.length) { vscode.window.showErrorMessage('Could not parse tasks from the plan.'); break; }
				const prdPathI = path.join(this.root, 'prd.json');

				// Warn about leftover .ralph/ state if this is a fresh import (no prd.json)
				if (!fs.existsSync(prdPathI)) {
					const ralphDir = path.join(this.root, '.ralph');
					if (fs.existsSync(ralphDir)) {
						const statusFiles = fs.readdirSync(ralphDir).filter(f => f.endsWith('-status'));
						if (statusFiles.length > 0) {
							const action = await vscode.window.showWarningMessage(
								`Found ${statusFiles.length} task status file(s) in .ralph/ from a previous project. Clear them before importing?`,
								'Clear .ralph/', 'Import anyway', 'Cancel'
							);
							if (!action || action === 'Cancel') { break; }
							if (action === 'Clear .ralph/') {
								for (const f of statusFiles) {
									try { fs.unlinkSync(path.join(ralphDir, f)); } catch { /**/ }
								}
								KanbanPanel.output?.appendLine('[Import] Cleared .ralph/ status files');
							}
						}
					}
				}
				if (fs.existsSync(prdPathI)) {
					const action = await vscode.window.showWarningMessage(
						`prd.json exists — ${imported.issues.length} tasks parsed. What do you want to do?`,
						'Append', 'Overwrite', 'Cancel'
					);
					if (!action || action === 'Cancel') { break; }
					if (action === 'Append') {
						const existing = JSON.parse(fs.readFileSync(prdPathI, 'utf-8'));
						const existingItems: any[] = existing.issues ?? existing.userStories ?? [];
						const existingIds = new Set(existingItems.map((i: any) => String(i.id)));
						const reIDed = imported.issues.map(i => {
							if (!existingIds.has(i.id)) { existingIds.add(i.id); return i; }
							const nid = generateNextId([...existingIds]);
							existingIds.add(nid);
							return { ...i, id: nid };
						});
						existingItems.push(...reIDed);
						if (existing.issues) { existing.issues = existingItems; } else { existing.userStories = existingItems; }
						fs.writeFileSync(prdPathI, JSON.stringify(existing, null, 2), 'utf-8');
						vscode.window.showInformationMessage(`Appended ${reIDed.length} issues to prd.json`);
						KanbanPanel.output?.appendLine(`[Import] Appended ${reIDed.length} issues`);
						this.render(); break;
					}
				}
				fs.writeFileSync(prdPathI, JSON.stringify(imported, null, 2), 'utf-8');
				vscode.window.showInformationMessage(`Created prd.json with ${imported.issues.length} issues`);
				KanbanPanel.output?.appendLine(`[Import] Overwrote prd.json with ${imported.issues.length} issues`);
				this.render();
				break;
			}

			case 'optimizeMemory':
				await vscode.commands.executeCommand('ralph-suite.optimizeMemory');
				break;

			case 'setupProject':
				await vscode.commands.executeCommand('ralph-suite.setupProject');
				break;

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
				KanbanPanel.output?.appendLine('[Board] initProject button clicked');
				await vscode.commands.executeCommand('ralph-suite.initProject');
				KanbanPanel.output?.appendLine('[Board] initProject command returned');
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

// ── Plan agent markdown → prd.json parser ────────────────────────────────────

interface ImportedPrd {
	project:     string;
	description: string;
	version:     string;
	issues:      any[];
}

function importPlanToPrd(markdown: string): ImportedPrd | null {
	const lines = markdown.split('\n');

	// Extract title from "## Plan: <title>" or first H1/H2
	let project     = 'Imported Project';
	let description = '';

	const titleMatch = markdown.match(/##\s+Plan:\s*(.+)/);
	if (titleMatch) { project = titleMatch[1].trim(); }
	else {
		const h1 = markdown.match(/^#\s+(.+)/m);
		if (h1) { project = h1[1].trim(); }
	}

	// Extract TL;DR as description
	const tldrMatch = markdown.match(/TL;DR[^\n]*[-–]\s*(.+)/i);
	if (tldrMatch) { description = tldrMatch[1].trim(); }

	// Parse numbered steps from "**Steps**" section
	const issues: any[] = [];
	let inSteps    = false;
	let stepNum    = 0;
	let currentStep: any = null;

	// Find relevant files section for later cross-referencing
	const relevantFiles: string[] = [];
	const fileMatches = markdown.matchAll(/`([^`]+\.[a-z]{2,6})`/g);
	for (const m of fileMatches) { relevantFiles.push(m[1]); }

	// Find verification section
	const verifyMatch  = markdown.match(/\*\*Verification\*\*([\s\S]*?)(?=\*\*[A-Z]|\n##|$)/);
	const verifyLines: string[] = [];
	if (verifyMatch) {
		for (const l of verifyMatch[1].split('\n')) {
			const t = l.replace(/^\d+\.\s*/, '').trim();
			if (t) { verifyLines.push(t); }
		}
	}

	// Parse steps — support both "1. text" and "1. **Phase:** text" patterns
	for (const line of lines) {
		const stepMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
		if (stepMatch && (inSteps || line.match(/^\s*1\.\s+/))) {
			inSteps = true;

			// Save previous step
			if (currentStep) { issues.push(currentStep); }

			stepNum++;
			const rawTitle = stepMatch[2]
				.replace(/\*\*/g, '')           // remove bold
				.replace(/\[([^\]]+)\]\([^)]+\)/, '$1') // flatten links
				.trim();

			// Detect if this is a git commit step
			const isGitCommit = /git\s+commit|stage.*commit|commit.*message/i.test(rawTitle);
			const epic = isGitCommit ? 'Git' : detectEpic(rawTitle);

			// Priority: first 2 steps P0, next 4 P1, rest P2
			const priority = stepNum <= 2 ? 'P0' : stepNum <= 6 ? 'P1' : 'P2';

			currentStep = {
				id:                 `STEP-${String(stepNum).padStart(3, '0')}`,
				title:              rawTitle.slice(0, 120),
				description:        rawTitle,
				epic,
				priority,
				status:             'todo',
				acceptanceCriteria: [],
				dependencies:       stepNum > 1 ? [`STEP-${String(stepNum - 1).padStart(3, '0')}`] : [],
				labels:             isGitCommit ? ['git'] : [],
			};
		} else if (inSteps && currentStep) {
			// Sub-bullets inside a step → acceptance criteria
			const bulletMatch = line.match(/^\s+[-*]\s+(.+)/);
			if (bulletMatch) {
				const criterion = bulletMatch[1]
					.replace(/\*\*/g, '')
					.replace(/\[([^\]]+)\]\([^)]+\)/, '$1')
					.trim();
				currentStep.acceptanceCriteria.push(criterion);
			}
		}

		// Stop at non-steps sections
		if (inSteps && line.match(/^\*\*(Relevant files|Verification|Decisions|Further)/i)) {
			inSteps = false;
		}
	}
	if (currentStep) { issues.push(currentStep); }

	// If no steps found, try to parse from "Further Considerations" or numbered lists anywhere
	if (!issues.length) {
		let n = 0;
		for (const line of lines) {
			const m = line.match(/^\d+\.\s+(.+)/);
			if (m) {
				n++;
				issues.push({
					id:                 `TASK-${String(n).padStart(3, '0')}`,
					title:              m[1].replace(/\*\*/g, '').trim().slice(0, 120),
					description:        m[1].replace(/\*\*/g, '').trim(),
					epic:               'General',
					priority:           'P2',
					status:             'todo',
					acceptanceCriteria: [],
					dependencies:       n > 1 ? [`TASK-${String(n - 1).padStart(3, '0')}`] : [],
					labels:             [],
				});
			}
		}
	}

	// Attach verification criteria to last non-git issue
	if (verifyLines.length) {
		const lastReal = [...issues].reverse().find(i => !i.labels.includes('git'));
		if (lastReal) {
			lastReal.acceptanceCriteria = [...(lastReal.acceptanceCriteria ?? []), ...verifyLines];
		}
	}

	if (!issues.length) { return null; }

	return { project, description, version: '1.0.0', issues };
}

function detectEpic(title: string): string {
	const t = title.toLowerCase();
	if (/auth|jwt|login|token|secret|cors/.test(t))      { return 'Auth'; }
	if (/test|verify|verif|coverage|spec/.test(t))        { return 'Testing'; }
	if (/doc|readme|deploy|guide|instruc/.test(t))        { return 'Docs'; }
	if (/docker|container|image|build/.test(t))           { return 'Infrastructure'; }
	if (/database|db|model|migration|schema/.test(t))     { return 'Database'; }
	if (/api|endpoint|route|handler|middleware/.test(t))  { return 'Backend'; }
	if (/ui|frontend|component|page|css|style/.test(t))   { return 'Frontend'; }
	if (/config|setup|init|install|env/.test(t))          { return 'Setup'; }
	return 'Core';
}

// ── ID generator ─────────────────────────────────────────────────────────────

function generateNextId(existingIds: string[]): string {
	// Detect format from existing IDs: US-001, ISSUE-001, STEP-001, TASK-001
	const patterns = [
		{ re: /^(US)-(\d+)$/, prefix: 'US' },
		{ re: /^(ISSUE)-(\d+)$/, prefix: 'ISSUE' },
		{ re: /^(STEP)-(\d+)$/, prefix: 'STEP' },
		{ re: /^(TASK)-(\d+)$/, prefix: 'TASK' },
	];

	for (const { re, prefix } of patterns) {
		const nums = existingIds
			.map(id => { const m = id.match(re); return m ? parseInt(m[2], 10) : null; })
			.filter((n): n is number => n !== null);
		if (nums.length > 0) {
			const next = Math.max(...nums) + 1;
			return `${prefix}-${String(next).padStart(3, '0')}`;
		}
	}

	// Fallback: ISSUE-NNN
	const fallbackNums = existingIds
		.map(id => { const m = id.match(/(\d+)$/); return m ? parseInt(m[1], 10) : null; })
		.filter((n): n is number => n !== null);
	const next = fallbackNums.length > 0 ? Math.max(...fallbackNums) + 1 : 1;
	return `ISSUE-${String(next).padStart(3, '0')}`;
}

// ── Add from Chat prompt ──────────────────────────────────────────────────────

function buildAddFromChatPrompt(prd: Prd | null, prdPath: string): string {
	const projectName = prd?.project ?? 'this project';
	const existingIds = (prd?.issues ?? []).map(i => i.id);
	const nextId      = generateNextId(existingIds);
	const epics       = prd ? [...new Set(prd.issues.map(i => i.epic || 'General'))].join(', ') : '';

	return [
		`I want to add one or more new issues to the prd.json for **${projectName}**.`,
		``,
		`Existing epics: ${epics || 'none yet'}`,
		`Next available ID: ${nextId}`,
		`prd.json location: \`${prdPath.replace(/\\/g, '/')}\``,
		``,
		`Please ask me what I want to add (in natural language), then:`,
		`1. Break it down into one or more concrete issues`,
		`2. For each issue generate a JSON object following this schema:`,
		`   - id: string starting from ${nextId} (increment for each new issue)`,
		`   - title: short descriptive title`,
		`   - description: what needs to be done`,
		`   - epic: pick from existing epics or create a new one`,
		`   - priority: "P0" | "P1" | "P2" | "P3"`,
		`   - status: always "todo"`,
		`   - acceptanceCriteria: array of strings`,
		`   - dependencies: array of existing issue IDs this depends on (empty if none)`,
		`   - labels: array of strings`,
		`3. Add the new issue(s) to the \`issues\` array (or \`userStories\` if that key exists) in \`${prdPath.replace(/\\/g, '/')}\``,
		`4. Do NOT modify any existing issues — only append`,
		`5. Confirm what was added with a brief summary`,
	].join('\n');
}
