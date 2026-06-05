import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PrdManager, Issue, Prd } from './prdManager';
import { RalphStateManager, TaskLog, safeTaskId } from './stateManager';
import { getShellHtml, getBoardContent, BoardConfig } from './webview/kanbanHtml';
import { buildPushPrompt, buildSyncPrompt } from './kanban/gitHubSync';
import { buildContextRefreshPrompt } from './kanban/contextRefresh';
import { importPlanToPrd, generateNextId, buildAddFromChatPrompt } from './kanban/planImport';

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
			KanbanPanel.current.handleMessage({ type, id }).catch(e => {
				KanbanPanel.output?.appendLine(`[Board] sendMessage error for ${type}: ${e}`);
			});
		}
	}

	private shellLoaded = false;

	private render() {
		if (this.disposed) { return; }
		try {
			const prd      = PrdManager.load(this.root, this.prdPathSetting());
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

	private prdPathSetting(): string {
		return vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', 'prd.json');
	}

	// ── Runner ────────────────────────────────────────────────────────────────

	private async checkAutoOptimize(): Promise<void> {
		const cfg          = vscode.workspace.getConfiguration('ralph-suite');
		const optimizeEvery = cfg.get<number>('memoryOptimizeEvery', 0);
		if (optimizeEvery <= 0) { return; }

		// Count completed tasks
		const prd = PrdManager.load(this.root, this.prdPathSetting());
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
		const prd = PrdManager.load(this.root, this.prdPathSetting());
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
				{
					const id = safeMessageId(msg.id);
					if (!id) { break; }
					await vscode.commands.executeCommand('ralph-suite.runTask', id);
				}
				break;

			case 'markDone': {
				const id = safeMessageId(msg.id);
				if (!id) { break; }
				const summary = await vscode.window.showInputBox({
					title: `Done: ${id}`,
					prompt: 'Brief summary (saved to project memory)',
					placeHolder: 'e.g. Created runpod/requirements.txt with pinned versions',
					ignoreFocusOut: true
				});
				RalphStateManager.setCompleted(this.root, id, summary ?? undefined);
				this.render();
				if (this.autoRun) { this.scheduleNextTask(2000); }
				break;
			}

			case 'moveCard': {
				const id = safeMessageId(msg.id);
				const status = msg.status;
				if (!id || !isBoardStatus(status)) { break; }
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
					const prdIP = PrdManager.load(this.root, this.prdPathSetting());
					const titleIP = prdIP?.issues.find(i => i.id === id)?.title ?? '';
					RalphStateManager.setInProgress(this.root, id, titleIP);
				} else if (status === 'todo') {
					RalphStateManager.reset(this.root, id);
				}
				this.render();
				break;
			}

			case 'reorderCard': {
				const id = safeMessageId(msg.id);
				const targetId = safeMessageId(msg.targetId);
				const before = msg.before === true;
				if (!id || !targetId) { break; }
				try {
					const changed = PrdManager.mutateRaw(this.root, (_raw, items) => {
						const fromIdx = items.findIndex((i: any) => i.id === id);
						const toIdx   = items.findIndex((i: any) => i.id === targetId);
						if (fromIdx === -1 || toIdx === -1) { return false; }
						const [moved] = items.splice(fromIdx, 1);
						const insertAt = before
							? (fromIdx < toIdx ? toIdx - 1 : toIdx)
							: (fromIdx < toIdx ? toIdx : toIdx + 1);
							items.splice(Math.max(0, insertAt), 0, moved);
						}, this.prdPathSetting());
					if (!changed) { break; }
					this.render();
				} catch (e) {
					KanbanPanel.output?.appendLine(`[Board] Reorder failed: ${e}`);
				}
				break;
			}

			case 'addNote': {
				const id = safeMessageId(msg.id);
				if (!id) { break; }
				const note = await vscode.window.showInputBox({
					title: `Add note: ${id}`,
					prompt: 'One line note — saved to log.json and memories.md',
					placeHolder: 'e.g. Fixed CORS headers, added Authorization to allowed list',
					ignoreFocusOut: true
				});
				if (!note) { break; }
				// Load log, inject note, save, append to memories
				const lp = RalphStateManager.logPath(this.root, id);
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
				const prd = PrdManager.load(this.root, this.prdPathSetting());
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
				const prd2 = PrdManager.load(this.root, this.prdPathSetting());
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
				const id = safeMessageId(msg.id);
				if (!id) { break; }
				const prdE = PrdManager.load(this.root, this.prdPathSetting());
				const issue = prdE?.issues.find(i => i.id === id);
				if (issue) {
					this.panel.webview.postMessage({ type: 'openEditModal', issue });
				}
				break;
			}

			case 'editIssue': {
				// Save edited issue back to prd.json
				const id = safeMessageId(msg.id);
				const fields = cleanIssueFields(msg.fields);
				if (!id || !fields) { break; }
				if (!fields.title) { break; }
				try {
					const changed = PrdManager.mutateRaw(this.root, (_raw, items) => {
						const idx = items.findIndex((i: any) => i.id === id);
						if (idx === -1) { return false; }
						// Merge allowlisted fields only.
						items[idx] = { ...items[idx], ...fields };
					}, this.prdPathSetting());
					if (!changed) { break; }
					this.render();
					KanbanPanel.output?.appendLine(`[Board] Edited issue ${id}`);
				} catch (e) {
					KanbanPanel.output?.appendLine(`[Board] Edit failed: ${e}`);
				}
				break;
			}

			case 'addIssue': {
				const prd = PrdManager.load(this.root, this.prdPathSetting());
				if (!prd) { vscode.window.showErrorMessage('No prd.json found.'); break; }
				const fields = cleanIssueFields(msg.issue);
				if (!fields.title) { break; }

				let newId = '';
				try {
					const changed = PrdManager.mutateRaw(this.root, (_raw, items) => {
						// Generate next ID based on existing format
						const existingIds: string[] = items.map((i: any) => i.id ?? '');
						newId = generateNextId(existingIds);
						items.push({
							id:                 newId,
							title:              fields.title,
							description:        fields.description ?? '',
							epic:               fields.epic,
							priority:           fields.priority ?? 'P2',
							status:             'todo',
							acceptanceCriteria: fields.acceptanceCriteria ?? [],
							dependencies:       [],
								labels:             fields.labels ?? [],
							});
						}, this.prdPathSetting());
					if (!changed) { break; }
					KanbanPanel.output?.appendLine(`[Board] Added issue ${newId}: ${fields.title}`);
					this.render();
				} catch (e) {
					KanbanPanel.output?.appendLine(`[Board] Add issue failed: ${e}`);
				}
				break;
			}

			case 'addFromChat': {
				const prd2    = PrdManager.load(this.root, this.prdPathSetting());
				const prdPath2 = PrdManager.prdPath(this.root, this.prdPathSetting());
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
				const prdPathI = PrdManager.prdPath(this.root, this.prdPathSetting());

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
						let appended = 0;
						PrdManager.mutateRaw(this.root, (_raw, existingItems) => {
							const existingIds = new Set(existingItems.map((i: any) => String(i.id)));
							const reIDed = imported.issues.map(i => {
								if (!existingIds.has(i.id)) { existingIds.add(i.id); return i; }
								const nid = generateNextId([...existingIds]);
								existingIds.add(nid);
								return { ...i, id: nid };
							});
							existingItems.push(...reIDed);
							appended = reIDed.length;
						}, this.prdPathSetting());
						vscode.window.showInformationMessage(`Appended ${appended} issues to prd.json`);
						KanbanPanel.output?.appendLine(`[Import] Appended ${appended} issues`);
						this.render(); break;
					}
				}
				PrdManager.saveRaw(this.root, imported, this.prdPathSetting());
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
				const p = PrdManager.prdPath(this.root, this.prdPathSetting());
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

			case 'contextRefresh': {
				const taskId = safeMessageId(msg.id);
				if (!taskId) { break; }
				KanbanPanel.output?.appendLine(`[Board] Context refresh requested for ${taskId}`);
				const prdCR = PrdManager.load(this.root, this.prdPathSetting());
				if (!prdCR) { vscode.window.showErrorMessage('No prd.json found.'); break; }
				const taskCR = prdCR.issues.find(i => i.id === taskId);
				if (!taskCR) { vscode.window.showErrorMessage(`Task ${taskId} not found.`); break; }
				const prompt = buildContextRefreshPrompt(this.root, taskCR, prdCR);
				try {
						await vscode.commands.executeCommand('workbench.action.chat.open', {
							query: prompt, isPartialQuery: false
						});
				} catch {
					await vscode.env.clipboard.writeText(prompt);
					vscode.window.showInformationMessage('Context refresh prompt copied — paste in Copilot Chat.');
				}
				KanbanPanel.output?.appendLine(`[Board] Context refresh prompt sent for ${taskId}`);
				break;
			}

			case 'log':
				KanbanPanel.output?.appendLine(`[Board] ${msg.text}`);
				break;
		}
	}
}

function safeMessageId(raw: unknown): string | null {
	if (typeof raw !== 'string') { return null; }
	const id = safeTaskId(raw);
	return id === raw.trim() && id !== 'UNKNOWN' ? id : null;
}

function isBoardStatus(raw: unknown): raw is Issue['status'] {
	return raw === 'todo' || raw === 'inprogress' || raw === 'completed' || raw === 'blocked';
}

function cleanText(raw: unknown, max = 1000): string {
	return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function cleanTextArray(raw: unknown, maxItems = 100): string[] {
	if (!Array.isArray(raw)) { return []; }
	return raw
		.filter((v): v is string => typeof v === 'string')
		.map(v => v.trim())
		.filter(Boolean)
		.slice(0, maxItems);
}

function cleanPriority(raw: unknown): Issue['priority'] {
	return raw === 'P0' || raw === 'P1' || raw === 'P2' || raw === 'P3' ? raw : 'P2';
}

function cleanIssueFields(raw: any): Partial<Issue> {
	return {
		title:              cleanText(raw?.title, 240),
		description:        cleanText(raw?.description, 4000),
		epic:               cleanText(raw?.epic, 120) || undefined,
		priority:           cleanPriority(raw?.priority),
		acceptanceCriteria: cleanTextArray(raw?.acceptanceCriteria),
		labels:             cleanTextArray(raw?.labels).map(l => l.slice(0, 80)),
		dependencies:       cleanTextArray(raw?.dependencies).map(safeTaskId),
	};
}

// ── GitHub prompt builders (extracted to kanban/gitHubSync.ts) ──────────────

// ── Plan import / ID generator / Add from Chat (extracted to kanban/planImport.ts) ─

// ── Context Refresh prompt (extracted to kanban/contextRefresh.ts) ──────────
