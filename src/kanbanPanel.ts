import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DEFAULT_PRD_PATH, PrdManager, Issue, Prd, prdWatchPattern } from './prdManager';
import { RalphStateManager, TaskLog, safeTaskId } from './stateManager';
import { getShellHtml, getBoardContent, BoardConfig } from './webview/kanbanHtml';
import { buildPushPrompt, buildSyncPrompt } from './kanban/gitHubSync';
import { buildContextRefreshPrompt } from './kanban/contextRefresh';
import { importPlanToPrd, buildAddFromChatPrompt, persistNewBacklogItem, applyEditedBacklogId, appendImportedIssues } from './kanban/planImport';
import { sendToChat } from './chatLauncher';
import { pendingTasksMessage } from './commands/task';
import { safeMessageId, isBoardStatus, cleanText, cleanTextArray, cleanPriority, cleanIssueFields, getNonce } from './boardSanitizers';
import { computeHealthScore } from './healthScore';
import { detectLocale } from './i18n';
import { requireWorkspaceTrust } from './workspaceTrust';
import { BoardScope, defaultBoardScope, listRalphFolders, resolveFolderIndex } from './workspaceFolders';
import { buildAnalyzeExistingProjectPrompt } from './kanban/analyzeProject';

export function shouldCompleteTask(summary: string | undefined): boolean {
	return summary !== undefined;
}

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
	private runnerAbortController: AbortController | null = null;
	private currentView: 'board' | 'epic' | 'history' = 'board';
	private boardScope: BoardScope = 'folder';
	private folders = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), this.prdPathSetting());


	private constructor(panel: vscode.WebviewPanel, root: string) {
		this.panel = panel;
		this.root  = root;
		this.folders = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), this.prdPathSetting());
		const inspect = vscode.workspace.getConfiguration('ralph-suite').inspect<BoardScope>('boardScope');
		this.boardScope = inspect?.workspaceValue ?? inspect?.globalValue ?? defaultBoardScope(this.folders.length);
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
		const watch = (root: string, pattern: string, cb: () => void) => {
			const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, pattern));
			w.onDidChange(cb); w.onDidCreate(cb); w.onDidDelete(cb);
			this.watchers.push(w);
		};
		const folders = this.folders.length ? this.folders : [{ index: 0, root: this.root, name: '', prdPath: '', hasPrd: false }];
		for (const folder of folders) {
			watch(folder.root, '.ralph/task-*-status', () => {
				KanbanPanel.output?.appendLine('[Ralph] Status changed — refreshing');
				this.render();
				if (this.autoRun) {
					this.checkAutoOptimize().then(() => { this.scheduleNextTask(3000); });
				}
			});
			watch(folder.root, '.ralph/task-*-note', () => {
				const ralphDir = path.join(folder.root, '.ralph');
				if (!fs.existsSync(ralphDir)) { return; }
				for (const f of fs.readdirSync(ralphDir)) {
					const m = f.match(/^task-(.+)-note$/);
					if (!m) { continue; }
					RalphStateManager.processNoteFile(folder.root, m[1], this.memoriesPathSetting());
					KanbanPanel.output?.appendLine(`[Ralph] Note captured for ${m[1]}`);
				}
				this.render();
			});
			watch(folder.root, prdWatchPattern(folder.root, this.prdPathSetting()), () => this.render());
			const memRel = path.relative(folder.root, RalphStateManager.memoriesPath(folder.root, this.memoriesPathSetting())) || '.agent/memories.md';
			watch(folder.root, memRel.replace(/\\/g, '/'), () => this.render());
		}
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
	static sendMessage(type: string, id?: string): boolean {
		if (KanbanPanel.current && !KanbanPanel.current.disposed) {
			KanbanPanel.current.handleMessage({ type, id }).catch(e => {
				KanbanPanel.output?.appendLine(`[Board] sendMessage error for ${type}: ${e}`);
			});
			return true;
		}
		return false;
	}

	static runnerSignal(): AbortSignal | undefined {
		return KanbanPanel.current?.runnerAbortController?.signal;
	}

	private shellLoaded = false;

	private render() {
		if (this.disposed) { return; }
		try {
			const prd      = this.aggregatedPrd();
			const loadedPaths = this.scopedFolders()
				.filter(folder => !!PrdManager.load(folder.root, this.prdPathSetting()))
				.map(folder => path.relative(this.root, PrdManager.prdPath(folder.root, this.prdPathSetting())).replace(/\\/g, '/') || '.')
				.join(', ');
			KanbanPanel.output?.appendLine(`[Ralph] Board loaded ${prd?.issues.length ?? 0} issues from ${loadedPaths || 'none'}`);
			const memories = this.loadFile(RalphStateManager.memoriesPath(this.root, this.memoriesPathSetting()));
			const logs     = this.loadLogs();
			const cfg      = this.getBoardConfig();
			this.panel.title = prd ? `${prd.project} — Board` : 'Ralph Board';

			// Load shell HTML only once — subsequent renders use postMessage
			if (!this.shellLoaded) {
				this.panel.webview.html = getShellHtml(getNonce(), detectLocale());
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
			const statuses = this.mergedStatuses();
			const html = getBoardContent(prd, memories, logs, cfg, statuses);
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
		// Compute health score (ADR-005) from current prd + statuses + logs
		const prd = this.aggregatedPrd();
		let health;
		if (prd) {
			const statuses = this.mergedStatuses();
			const logs = Object.values(this.loadLogs());
			health = computeHealthScore(prd, statuses, logs);
		}
		return {
			autoRun:    this.autoRun,
			maxLoops:   s.get<number>('maxLoops', 5),
			guardrails: s.get<string[]>('guardrails', []),
			boundaries: s.get<string[]>('boundaries', []),
			view:       this.currentView,
			health,
			locale:     detectLocale(),
			boardScope: this.boardScope,
			showScopeSwitch: this.folders.length > 1,
		};
	}

	private loadFile(p: string): string | null {
		if (!fs.existsSync(p)) { return null; }
		return fs.readFileSync(p, 'utf-8').trim() || null;
	}

	private scopedFolders() {
		this.folders = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), this.prdPathSetting());
		if (this.boardScope !== 'workspace' && this.folders.length > 1) {
			return this.folders.filter(folder => folder.root === this.root);
		}
		return this.folders.length ? this.folders : [{ index: 0, root: this.root, name: 'folder', prdPath: this.prdPathSetting(), hasPrd: false }];
	}

	private loadLogs(): Record<string, TaskLog> {
		const map: Record<string, TaskLog> = {};
		for (const folder of this.scopedFolders()) {
			for (const l of RalphStateManager.getAllLogs(folder.root)) {
				map[`${folder.index}:${l.id}`] = l;
				if (!(l.id in map)) { map[l.id] = l; }
			}
		}
		return map;
	}

	private mergedStatuses(): Record<string, string> {
		const statuses: Record<string, string> = {};
		for (const folder of this.scopedFolders()) {
			for (const [id, status] of Object.entries(RalphStateManager.getAllStatuses(folder.root))) {
				statuses[`${folder.index}:${id}`] = status;
				if (!(id in statuses)) { statuses[id] = status; }
			}
		}
		return statuses;
	}

	private folderFromMessage(msg: any) {
		if (this.boardScope === 'folder') {
			return this.folders.find(folder => folder.root === this.root) ?? this.folders[0];
		}
		const index = resolveFolderIndex(typeof msg?.folderIndex === 'string' && msg.folderIndex !== '' ? Number(msg.folderIndex) : msg?.folderIndex, this.folders.length);
		if (index !== null) { return this.folders[index]; }
		return this.folders.find(folder => folder.root === this.root) ?? this.folders[0];
	}

	private aggregatedPrd(): Prd | null {
		this.folders = listRalphFolders(vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath), this.prdPathSetting());
		const scoped = this.boardScope === 'workspace' || this.folders.length <= 1
			? this.folders
			: this.folders.filter(folder => folder.root === this.root);
		const loaded = scoped
			.map(folder => ({ folder, prd: PrdManager.load(folder.root, this.prdPathSetting()) }))
			.filter((entry): entry is { folder: { index: number; root: string; name: string; prdPath: string; hasPrd: boolean }; prd: Prd } => !!entry.prd);
		if (!loaded.length) { return null; }
		return {
			project: this.boardScope === 'workspace' && loaded.length > 1 ? 'Workspace' : loaded[0].prd.project,
			description: loaded.map(entry => entry.prd.project).join(' + '),
			version: loaded[0].prd.version,
			issues: loaded.flatMap(entry => entry.prd.issues.map(issue => ({ ...issue, folderIndex: entry.folder.index, folderName: entry.folder.name }))),
		};
	}

	private prdPathSetting(): string {
		return vscode.workspace.getConfiguration('ralph-suite').get<string>('prdPath', DEFAULT_PRD_PATH) ?? DEFAULT_PRD_PATH;
	}

	private memoriesPathSetting(): string {
		return vscode.workspace.getConfiguration('ralph-suite').get<string>('memoriesPath', '.agent/memories.md');
	}

	// ── Runner ────────────────────────────────────────────────────────────────

	private async checkAutoOptimize(): Promise<void> {
		const cfg          = vscode.workspace.getConfiguration('ralph-suite');
		const optimizeEvery = cfg.get<number>('memoryOptimizeEvery', 0);
		if (optimizeEvery <= 0) { return; }

		// Count completed tasks
		const prd = this.aggregatedPrd();
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
		this.runnerAbortController = new AbortController();
		KanbanPanel.output?.appendLine(`[Runner] Started — max ${maxLoops} tasks`);
		vscode.window.showInformationMessage(`Ralph runner started (max ${maxLoops} tasks)`);
		this.render();
		this.runNextTask();
	}

	private stopRunner() {
		this.autoRun = false;
		this.runnerAbortController?.abort();
		this.runnerAbortController = null;
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
		const prd = this.aggregatedPrd();
		if (!prd) { this.stopRunner(); return; }

		const inProgress = prd.issues.find(i => i.status === 'inprogress');
		if (inProgress) {
			KanbanPanel.output?.appendLine(`[Runner] ${inProgress.id} still in progress — waiting`);
			return;
		}
		const next = PrdManager.nextPending(prd, this.root);
		if (!next) {
			vscode.window.showInformationMessage(pendingTasksMessage(
				prd.issues,
				'Ralph: all tasks completed!',
				'Ralph: no hay tareas elegibles; quedan tareas bloqueadas o fallidas.',
			));
			this.stopRunner();
			return;
		}
		this.loopCount++;
		KanbanPanel.output?.appendLine(`[Runner] Loop ${this.loopCount}/${maxLoops} → ${next.id}`);
		await vscode.commands.executeCommand('ralph-suite.runTask', next.id, this.folders.find(folder => folder.index === next.folderIndex)?.root);
	}

	// ── Message handler ───────────────────────────────────────────────────────

	private async handleMessage(msg: any) {
		const mutatingTypes = new Set([
			'runTask', 'markDone', 'moveCard', 'reorderCard', 'addNote', 'startRunner', 'stopRunner',
			'pushToGitHub', 'syncFromGitHub', 'showAddIssue', 'editIssue', 'addIssue', 'addFromChat',
			'importPlan', 'optimizeMemory', 'setupProject', 'openMemories', 'initProject', 'analyzeProject', 'setBoardScope', 'contextRefresh', 'resetTask',
		]);
		if (mutatingTypes.has(msg.type) && !requireWorkspaceTrust(`realizar ${msg.type}`)) { return; }
		switch (msg.type) {

			case 'runTask':
				{
					const id = safeMessageId(msg.id);
					const folder = this.folderFromMessage(msg);
					if (!id || !folder) { break; }
					await vscode.commands.executeCommand('ralph-suite.runTask', id, folder.root);
				}
				break;

			case 'resetTask': {
				const id = safeMessageId(msg.id);
				const folder = this.folderFromMessage(msg);
				if (id && folder) { RalphStateManager.reset(folder.root, id); this.render(); }
				break;
			}

			case 'markDone': {
				const id = safeMessageId(msg.id);
				if (!id) { break; }
				const summary = await vscode.window.showInputBox({
					title: `Done: ${id}`,
					prompt: 'Brief summary (saved to project memory)',
					placeHolder: 'e.g. Created runpod/requirements.txt with pinned versions',
					ignoreFocusOut: true
				});
				if (!shouldCompleteTask(summary)) { break; }
				RalphStateManager.setCompleted((this.folderFromMessage(msg)?.root ?? this.root), id, summary || undefined, undefined, this.memoriesPathSetting());
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
					if (!shouldCompleteTask(summary)) { break; }
					RalphStateManager.setCompleted((this.folderFromMessage(msg)?.root ?? this.root), id, summary || undefined, undefined, this.memoriesPathSetting());
				} else if (status === 'inprogress') {
					const folder = this.folderFromMessage(msg);
					const prdIP = PrdManager.load(folder?.root ?? this.root, this.prdPathSetting());
					const titleIP = prdIP?.issues.find(i => i.id === id)?.title ?? '';
					RalphStateManager.setInProgress(folder?.root ?? this.root, id, titleIP);
				} else if (status === 'todo') {
					RalphStateManager.reset(this.folderFromMessage(msg)?.root ?? this.root, id);
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
					const changed = PrdManager.mutateRaw(this.folderFromMessage(msg)?.root ?? this.root, (_raw, items) => {
						const fromIdx = items.findIndex((i: any) => String(i.id) === id);
						const toIdx   = items.findIndex((i: any) => String(i.id) === targetId);
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
				const lp = RalphStateManager.logPath(this.folderFromMessage(msg)?.root ?? this.root, id);
				if (fs.existsSync(lp)) {
					try {
						const log = JSON.parse(fs.readFileSync(lp, 'utf-8'));
						log.note = note;
						fs.writeFileSync(lp, JSON.stringify(log, null, 2), 'utf-8');
						RalphStateManager.appendMemory(this.folderFromMessage(msg)?.root ?? this.root, log, this.memoriesPathSetting());
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
				const statuses = this.mergedStatuses();
				const pending = prd.issues.filter(i => {
					const s = statuses[i.id] ?? 'todo';
					return s === 'todo' || s === 'blocked';
				});
				if (!pending.length) {
					vscode.window.showInformationMessage('No pending issues to push.');
					break;
				}
				const prompt = buildPushPrompt(prd, pending);
				await sendToChat(prompt, {
					fallbackMessage: 'Prompt copied — paste in Copilot Chat.',
				});
				KanbanPanel.output?.appendLine(`[GitHub] Push prompt sent for ${pending.length} issues`);
				break;
			}

			case 'syncFromGitHub': {
				const prd2 = PrdManager.load(this.root, this.prdPathSetting());
				if (!prd2) { vscode.window.showErrorMessage('No prd.json found.'); break; }
				const prompt2 = buildSyncPrompt(prd2, this.root);
				await sendToChat(prompt2, {
					fallbackMessage: 'Prompt copied — paste in Copilot Chat.',
				});
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
				const proposedId = msg.fields && typeof msg.fields === 'object' && Object.prototype.hasOwnProperty.call(msg.fields, 'id')
					? msg.fields.id
					: undefined;
				try {
					const changed = PrdManager.mutateRaw(this.folderFromMessage(msg)?.root ?? this.root, (_raw, items) => {
						const idx = items.findIndex((i: any) => String(i.id) === id);
						if (idx === -1) { return false; }
						const existingIds = items.map((i: any) => String(i.id ?? ''));
						const nextId = applyEditedBacklogId(id, proposedId, existingIds);
						items[idx] = { ...items[idx], ...fields, id: nextId };
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
					const changed = PrdManager.mutateRaw(this.folderFromMessage(msg)?.root ?? this.root, (_raw, items) => {
						const existingIds: string[] = items.map((i: any) => String(i.id ?? ''));
						const persisted = persistNewBacklogItem({
							id:                 msg.issue?.id,
							title:              fields.title,
							description:        fields.description ?? '',
							epic:               fields.epic,
							priority:           fields.priority ?? 'P2',
							status:             'todo',
							acceptanceCriteria: fields.acceptanceCriteria ?? [],
							dependencies:       [],
							labels:             fields.labels ?? [],
						}, existingIds);
						newId = persisted.id;
						items.push(persisted);
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
				await sendToChat(prompt, {
					fallbackMessage: 'Prompt copied — paste in Chat.',
				});
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
							const reIDed = appendImportedIssues(existingItems, imported.issues);
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
				const p = RalphStateManager.memoriesPath(this.root, this.memoriesPathSetting());
				RalphStateManager.initMemories(this.root, '', this.memoriesPathSetting());
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

			case 'analyzeProject':
				await vscode.commands.executeCommand('ralph-suite.analyzeProject');
				break;

			case 'setBoardScope':
				if (msg.id === 'folder' || msg.id === 'workspace') {
					this.boardScope = msg.id;
					void vscode.workspace.getConfiguration('ralph-suite').update('boardScope', msg.id, vscode.ConfigurationTarget.Workspace);
					this.render();
				}
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
				const prompt = buildContextRefreshPrompt(this.root, taskCR, prdCR, this.memoriesPathSetting());
				await sendToChat(prompt, {
					fallbackMessage: 'Context refresh prompt copied — paste in Copilot Chat.',
				});
				KanbanPanel.output?.appendLine(`[Board] Context refresh prompt sent for ${taskId}`);
				break;
			}

			case 'log':
				KanbanPanel.output?.appendLine(`[Board] ${msg.text}`);
				break;
		}
	}
}

// ── GitHub prompt builders (extracted to kanban/gitHubSync.ts) ──────────────

// ── Plan import / ID generator / Add from Chat (extracted to kanban/planImport.ts) ─

// ── Context Refresh prompt (extracted to kanban/contextRefresh.ts) ──────────

// ── Board sanitizers + nonce (extracted to boardSanitizers.ts) ───────────────
