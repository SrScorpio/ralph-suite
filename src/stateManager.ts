import * as fs from 'fs';
import * as path from 'path';

const RALPH_DIR = '.ralph';
const AGENT_DIR = '.agent';

export interface TaskLog {
	id: string;
	title: string;
	status: 'inprogress' | 'completed' | 'failed';
	startedAt: string;
	completedAt?: string;
	durationMin?: number;
	note?: string;          // auto-captured from NOTA: line written by agent
	summary?: string;       // manual note added via Mark done input box
	filesChanged?: string[];
}

export class RalphStateManager {

	// ── Paths ───────────────────────────────────────────────────────────────
	static ralphDir(root: string) { return path.join(root, RALPH_DIR); }
	static agentDir(root: string) { return path.join(root, AGENT_DIR); }
	static statusPath(root: string, id: string) {
		return path.join(this.ralphDir(root), `task-${id}-status`);
	}
	static logPath(root: string, id: string) {
		return path.join(this.ralphDir(root), `task-${id}-log.json`);
	}
	static memoriesPath(root: string) {
		return path.join(this.agentDir(root), 'memories.md');
	}

	// ── Init ─────────────────────────────────────────────────────────────────
	static ensure(root: string) {
		const rd = this.ralphDir(root);
		const ad = this.agentDir(root);
		if (!fs.existsSync(rd)) { fs.mkdirSync(rd, { recursive: true }); }
		if (!fs.existsSync(ad)) { fs.mkdirSync(ad, { recursive: true }); }

		// Add .ralph/ to .gitignore (not .agent/ — memories should be committed)
		const gi = path.join(root, '.gitignore');
		let content = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf-8') : '';
		if (!content.includes('.ralph/')) {
			const sep = content.endsWith('\n') ? '' : '\n';
			fs.writeFileSync(gi, `${content}${sep}\n# Ralph Suite runtime state (do not commit)\n.ralph/\n`, 'utf-8');
		}
	}

	// ── Status ───────────────────────────────────────────────────────────────
	static setInProgress(root: string, id: string, title?: string) {
		this.ensure(root);
		fs.writeFileSync(this.statusPath(root, id), 'inprogress', 'utf-8');

		// Create or update log entry — preserve existing title if not provided
		const lp = this.logPath(root, id);
		let existingTitle = title ?? '';
		if (!existingTitle && fs.existsSync(lp)) {
			try { existingTitle = JSON.parse(fs.readFileSync(lp, 'utf-8')).title ?? ''; } catch { /**/ }
		}
		const log: TaskLog = {
			id,
			title: existingTitle,
			status: 'inprogress',
			startedAt: new Date().toISOString(),
		};
		fs.writeFileSync(this.logPath(root, id), JSON.stringify(log, null, 2), 'utf-8');
	}

	static setCompleted(root: string, id: string, summary?: string, filesChanged?: string[]) {
		this.ensure(root);
		fs.writeFileSync(this.statusPath(root, id), 'completed', 'utf-8');

		// Update log entry
		const logFile = this.logPath(root, id);
		let log: TaskLog = { id, title: id, status: 'completed', startedAt: new Date().toISOString() };
		if (fs.existsSync(logFile)) {
			try { log = JSON.parse(fs.readFileSync(logFile, 'utf-8')); } catch { /**/ }
		}
		const startedAt = new Date(log.startedAt);
		const completedAt = new Date();
		log.status = 'completed';
		log.completedAt = completedAt.toISOString();
		log.durationMin = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
		if (summary) { log.summary = summary; }
		if (filesChanged) { log.filesChanged = filesChanged; }
		fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf-8');

		// Append to memories.md
		if (summary) {
			this.appendMemory(root, log);
		}
	}

	static setFailed(root: string, id: string, reason?: string) {
		this.ensure(root);
		fs.writeFileSync(this.statusPath(root, id), 'failed', 'utf-8');
		const logFile = this.logPath(root, id);
		if (fs.existsSync(logFile)) {
			try {
				const log: TaskLog = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
				log.status = 'failed';
				log.completedAt = new Date().toISOString();
				if (reason) { log.summary = `FAILED: ${reason}`; }
				fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf-8');
			} catch { /**/ }
		}
	}

	static reset(root: string, id: string) {
		const sp = this.statusPath(root, id);
		if (fs.existsSync(sp)) { fs.unlinkSync(sp); }
		// Keep log for history — don't delete it
	}

	static getStatus(root: string, id: string): 'todo' | 'inprogress' | 'completed' | 'blocked' {
		const p = this.statusPath(root, id);
		if (!fs.existsSync(p)) { return 'todo'; }
		const v = fs.readFileSync(p, 'utf-8').trim();
		if (v === 'inprogress') { return 'inprogress'; }
		if (v === 'completed')  { return 'completed'; }
		return 'todo';
	}

	static getAllStatuses(root: string): Record<string, 'todo' | 'inprogress' | 'completed' | 'blocked'> {
		const result: Record<string, 'todo' | 'inprogress' | 'completed' | 'blocked'> = {};
		const d = this.ralphDir(root);
		if (!fs.existsSync(d)) { return result; }
		for (const f of fs.readdirSync(d)) {
			const m = f.match(/^task-(.+)-status$/);
			if (!m) { continue; }
			result[m[1]] = this.getStatus(root, m[1]);
		}
		return result;
	}

	// ── Log access ───────────────────────────────────────────────────────────
	static notePath(root: string, id: string) {
		return path.join(this.ralphDir(root), `task-${id}-note`);
	}

	/**
	 * Called by the file watcher when a -note file appears.
	 * Reads the NOTA: line, saves it into the log.json, appends to memories,
	 * then deletes the signal file.
	 */
	static processNoteFile(root: string, id: string): void {
		const np = this.notePath(root, id);
		if (!fs.existsSync(np)) { return; }

		try {
			const raw   = fs.readFileSync(np, 'utf-8').trim();

			// Find NOTA: line anywhere in the file (agent may write other text too)
			const lines = raw.split(/\r?\n/);
			const notaLine = lines.find(l => l.trimStart().toUpperCase().startsWith('NOTA:'));
			const note = notaLine
				? notaLine.trimStart().slice(5).trim()   // strip "NOTA:" prefix
				: lines[lines.length - 1].trim();         // fallback: last non-empty line

			// Load existing log or create minimal one
			const lp  = this.logPath(root, id);
			let log: TaskLog = { id, title: id, status: 'completed', startedAt: new Date().toISOString() };
			if (fs.existsSync(lp)) {
				try { log = JSON.parse(fs.readFileSync(lp, 'utf-8')); } catch { /**/ }
			}

			// Inject note into log
			log.note = note;
			if (!log.completedAt) { log.completedAt = new Date().toISOString(); }
			if (!log.status || log.status === 'inprogress') { log.status = 'completed'; }

			// Compute duration if possible
			if (!log.durationMin && log.startedAt) {
				const ms = new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime();
				log.durationMin = Math.round(ms / 60000);
			}

			fs.writeFileSync(lp, JSON.stringify(log, null, 2), 'utf-8');

			// Append to memories.md
			this.appendMemory(root, log);

			// Delete the signal file — it's been consumed
			fs.unlinkSync(np);
		} catch (e) {
			console.error('[Ralph] Failed to process note file:', e);
		}
	}

	// ── Log access ───────────────────────────────────────────────────────────
	static getLog(root: string, id: string): TaskLog | null {
		const p = this.logPath(root, id);
		if (!fs.existsSync(p)) { return null; }
		try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
	}

	static getAllLogs(root: string): TaskLog[] {
		const d = this.ralphDir(root);
		if (!fs.existsSync(d)) { return []; }
		const logs: TaskLog[] = [];
		for (const f of fs.readdirSync(d)) {
			if (!f.endsWith('-log.json')) { continue; }
			try {
				logs.push(JSON.parse(fs.readFileSync(path.join(d, f), 'utf-8')));
			} catch { /**/ }
		}
		return logs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
	}

	// ── Memories ─────────────────────────────────────────────────────────────
	static appendMemory(root: string, log: TaskLog) {
		const mp = this.memoriesPath(root);
		const ad = this.agentDir(root);
		if (!fs.existsSync(ad)) { fs.mkdirSync(ad, { recursive: true }); }

		let content = fs.existsSync(mp) ? fs.readFileSync(mp, 'utf-8') : '# Project Memories\n\n';

		const date     = new Date().toISOString().slice(0, 10);
		const rawNote  = log.note || log.summary || '';
		// Strip NOTA: prefix in case it survived from old data
		const noteText = rawNote.trimStart().toUpperCase().startsWith('NOTA:')
			? rawNote.trimStart().slice(5).trim()
			: rawNote.trim();

		const entry = [
			`\n## [${date}] ${log.id}: ${log.title}`,
			`- **Duration:** ${log.durationMin ?? '?'} min`,
			noteText ? `- **Note:** ${noteText}` : '',
			log.filesChanged?.length
				? `- **Files:** ${log.filesChanged.slice(0, 5).join(', ')}${log.filesChanged.length > 5 ? ` +${log.filesChanged.length - 5} more` : ''}`
				: '',
			'',
		].filter(l => l !== '').join('\n');

		fs.writeFileSync(mp, content + entry, 'utf-8');
	}

	static initMemories(root: string, projectGoal: string) {
		const mp = this.memoriesPath(root);
		if (fs.existsSync(mp)) { return; }
		this.ensure(root);
		const content = [
			'# Project Memories',
			'',
			'> Auto-updated by Ralph Suite on task completion.',
			'> Edit freely — this file is committed to git.',
			'',
			'## Project',
			`- Goal: ${projectGoal}`,
			`- Created: ${new Date().toISOString().slice(0, 10)}`,
			'',
			'## Conventions',
			'- (add project-specific rules here)',
			'',
			'## Known Issues',
			'- (document recurring problems here)',
			'',
			'## Completed Tasks',
			'',
		].join('\n');
		fs.writeFileSync(mp, content, 'utf-8');
	}
}
