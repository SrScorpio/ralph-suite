import { Prd, Issue } from '../prdManager';
import { TaskLog } from '../stateManager';

const PRIORITY_DOT: Record<string, string> = {
	P0: '#f85149', P1: '#e3b341', P2: '#58a6ff', P3: '#6e7681'
};
const PRIORITY_LABEL: Record<string, string> = {
	P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low'
};
const STATUS_COLS = [
	{ id: 'todo',       label: 'To Do',      accent: '#8b949e' },
	{ id: 'inprogress', label: 'In Progress', accent: '#58a6ff' },
	{ id: 'completed',  label: 'Done',        accent: '#3fb950' },
	{ id: 'blocked',    label: 'Blocked',     accent: '#f85149' },
];

export type ViewMode = 'board' | 'epic' | 'history';

export interface BoardConfig {
	autoRun:    boolean;
	maxLoops:   number;
	guardrails: string[];
	boundaries: string[];
	view:       ViewMode;
}

// ── Card ─────────────────────────────────────────────────────────────────────

function card(issue: Issue, log: TaskLog | null): string {
	const pc   = PRIORITY_DOT[issue.priority] ?? '#6e7681';
	const pl   = PRIORITY_LABEL[issue.priority] ?? issue.priority;
	const deps = issue.dependencies?.length
		? `<div class="card-deps">⛓ ${issue.dependencies.join(', ')}</div>` : '';
	const epic   = issue.epic ? `<span class="card-epic">${esc(issue.epic)}</span>` : '';
	const labels = (issue.labels ?? []).map(l => `<span class="card-label">${esc(l)}</span>`).join('');

	let logBadge = '';
	if (log?.status === 'completed' && log.durationMin !== undefined) {
		logBadge = `<span class="log-badge log-done">✓ ${log.durationMin}m</span>`;
	} else if (log?.status === 'inprogress') {
		logBadge = `<span class="log-badge log-running log-waiting">⏱ waiting…</span>`;
	}

	const noteText = log?.note || log?.summary || '';
	const noteHtml = noteText
		? `<div class="card-summary">${esc(noteText.slice(0, 140))}${noteText.length > 140 ? '…' : ''}</div>`
		: '';

	// Acceptance criteria tooltip
	const criteriaCount = issue.acceptanceCriteria?.length ?? 0;
	const criteriaTooltip = criteriaCount > 0
		? issue.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n')
		: '';

	let actions = '';
	if (issue.status === 'todo') {
		actions = `<button class="btn btn-run" onclick="send('runTask','${issue.id}')">▶ Run</button>`;
	} else if (issue.status === 'blocked') {
		actions = `<button class="btn btn-disabled" disabled>⛓ Blocked</button>`;
	} else if (issue.status === 'inprogress') {
		actions = `<button class="btn btn-done" onclick="send('markDone','${issue.id}')">✓ Mark done</button>`;
	} else {
		actions = `<button class="btn btn-note" onclick="send('addNote','${issue.id}')" title="Add note">✎</button>
			<button class="btn btn-reset" onclick="send('resetTask','${issue.id}')">↩ Reset</button>`;
	}

	return `
<div class="card" draggable="true"
     data-id="${issue.id}" data-status="${issue.status}"
     ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"
     ondragover="onCardDragOver(event)" ondrop="onCardDrop(event)">
  <div class="card-header">
    <div class="card-header-left">
      <span class="card-id">${esc(issue.id)}</span>${epic}${labels}
    </div>
    <div class="card-header-right">
      <span class="priority-dot" style="background:${pc}" title="${pl}"></span>
      ${logBadge}
    </div>
  </div>
  <div class="card-title">${esc(issue.title)}</div>
  ${issue.description ? `<div class="card-desc">${esc(issue.description.slice(0, 100))}${issue.description.length > 100 ? '…' : ''}</div>` : ''}
  ${noteHtml}${deps}
  <div class="card-footer">
    <span class="card-criteria${criteriaTooltip ? ' has-tooltip' : ''}"
          ${criteriaTooltip ? `data-tooltip="${esc(criteriaTooltip)}"` : ''}
    >${criteriaCount} criteria${criteriaCount > 0 ? ' 👁' : ''}</span>
    ${actions}
  </div>
</div>`;
}

// ── Board view (by status) ────────────────────────────────────────────────────

function boardView(prd: Prd, logs: Record<string, TaskLog>, autoRun: boolean): string {
	return `<div class="board">
  ${STATUS_COLS.map(col => {
		const issues = prd.issues.filter(i => i.status === col.id);
		const runnerBadge = col.id === 'inprogress' && autoRun
			? `<span class="runner-badge">⚡ auto</span>` : '';
		return `
<div class="col" data-col="${col.id}"
     ondragover="onDragOver(event)" ondragenter="onDragEnter(event)"
     ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
  <div class="col-header" style="--accent:${col.accent}">
    <span class="col-title">${col.label}</span>
    <div style="display:flex;align-items:center;gap:5px">
      ${runnerBadge}
      <span class="col-count">${issues.length}</span>
    </div>
  </div>
  <div class="col-body">
    ${issues.length ? issues.map(i => card(i, logs[i.id] ?? null)).join('') : `<div class="col-empty" data-col="${col.id}">Drop here</div>`}
  </div>
</div>`;
	}).join('')}
</div>`;
}

// ── Epic view (by epic group) ─────────────────────────────────────────────────

function epicView(prd: Prd, logs: Record<string, TaskLog>): string {
	const epics = [...new Set(prd.issues.map(i => i.epic || 'General'))];
	return `<div class="epic-view">
  ${epics.map(epic => {
		const issues = prd.issues.filter(i => (i.epic || 'General') === epic);
		const done   = issues.filter(i => i.status === 'completed').length;
		const pct    = issues.length ? Math.round((done / issues.length) * 100) : 0;
		return `
<div class="epic-group">
  <div class="epic-group-header">
    <span class="epic-group-title">${esc(epic)}</span>
    <div class="epic-group-meta">
      <div class="progress-track" style="width:80px">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="progress-label">${done}/${issues.length}</span>
    </div>
  </div>
  <div class="epic-cols">
    ${STATUS_COLS.map(col => {
			const colIssues = issues.filter(i => i.status === col.id);
			if (!colIssues.length) { return ''; }
			return `<div class="epic-col">
        <div class="epic-col-label" style="color:${col.accent}">${col.label} (${colIssues.length})</div>
        ${colIssues.map(i => card(i, logs[i.id] ?? null)).join('')}
      </div>`;
		}).filter(Boolean).join('')}
  </div>
</div>`;
	}).join('')}
</div>`;
}

// ── History view ──────────────────────────────────────────────────────────────

function historyView(logs: Record<string, TaskLog>): string {
	const entries = Object.values(logs)
		.filter(l => l.completedAt)
		.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

	if (!entries.length) {
		return `<div class="empty-state">
  <div class="empty-icon">📋</div>
  <div class="empty-title">No history yet</div>
  <div class="empty-sub">Completed tasks will appear here with their logs.</div>
</div>`;
	}

	const rows = entries.map(l => {
		const date     = l.completedAt ? new Date(l.completedAt).toLocaleString() : '—';
		const dur      = l.durationMin !== undefined ? `${l.durationMin}m` : '—';
		const noteText = l.note || l.summary || '';
		const statusDot = l.status === 'completed'
			? `<span style="color:#3fb950">✓</span>`
			: `<span style="color:#f85149">✗</span>`;
		return `
<tr class="history-row">
  <td class="history-status">${statusDot}</td>
  <td class="history-id"><span class="card-id">${esc(l.id)}</span></td>
  <td class="history-title">${esc(l.title)}</td>
  <td class="history-dur">${dur}</td>
  <td class="history-date">${date}</td>
  <td class="history-note">${noteText ? esc(noteText.slice(0, 80)) + (noteText.length > 80 ? '…' : '') : '<span style="opacity:.4">—</span>'}</td>
</tr>`;
	}).join('');

	const totalDone = entries.filter(l => l.status === 'completed').length;
	const totalMin  = entries.reduce((s, l) => s + (l.durationMin ?? 0), 0);
	const avgMin    = entries.length ? Math.round(totalMin / entries.length) : 0;

	return `
<div class="history-view">
  <div class="history-stats">
    <div class="hstat"><span class="hstat-val">${totalDone}</span><span class="hstat-label">Completed</span></div>
    <div class="hstat"><span class="hstat-val">${totalMin}m</span><span class="hstat-label">Total time</span></div>
    <div class="hstat"><span class="hstat-val">${avgMin}m</span><span class="hstat-label">Avg / task</span></div>
    <div class="hstat"><span class="hstat-val">${entries.length}</span><span class="hstat-label">Total runs</span></div>
  </div>
  <table class="history-table">
    <thead>
      <tr>
        <th></th><th>ID</th><th>Title</th><th>Time</th><th>Completed</th><th>Note</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function statsBar(prd: Prd, cfg: BoardConfig): string {
	const total = prd.issues.length;
	const done  = prd.issues.filter(i => i.status === 'completed').length;
	const pct   = total ? Math.round((done / total) * 100) : 0;
	const epics = [...new Set(prd.issues.map(i => i.epic || 'General'))];

	const runnerBtn = cfg.autoRun
		? `<button class="btn btn-sm btn-runner-on" onclick="send('stopRunner')">⏹ Stop</button>`
		: `<button class="btn btn-sm btn-runner-off" onclick="send('startRunner')">⚡ Auto-run</button>`;

	const viewBtns = (['board','epic','history'] as const).map(v =>
		`<button class="btn btn-sm ${cfg.view === v ? 'btn-view-active' : ''}" onclick="send('setView','${v}')">${
			v === 'board' ? '⊞ Board' : v === 'epic' ? '⬡ Epic' : '📋 History'
		}</button>`
	).join('');

	return `
<div class="stats-bar">
  <div class="stats-left">
    <div class="stats-title">${esc(prd.project)}</div>
    <div class="stats-desc">${esc(prd.description)}</div>
  </div>
  <div class="stats-mid">
    <div class="progress-row">
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-label">${done}/${total}&nbsp;<strong>${pct}%</strong></span>
    </div>
    <div class="epics-row">${epics.map(e => `<span class="epic-chip">${esc(e)}</span>`).join('')}</div>
  </div>
  <div class="stats-actions">
    <div class="view-switcher">${viewBtns}</div>
    ${runnerBtn}
    <button class="btn btn-sm btn-github" onclick="send('pushToGitHub')" title="Push pending to GitHub">⬆ GitHub</button>
    <button class="btn btn-sm btn-github" onclick="send('syncFromGitHub')" title="Sync from GitHub">⬇ Sync</button>
    <button class="btn btn-sm btn-add" onclick="send('showAddIssue')" title="Add new issue">＋ Issue</button>
    <button class="btn btn-sm btn-add" onclick="send('addFromChat')" title="Describe in natural language">＋ Chat</button>
    <button class="btn btn-sm" onclick="send('openPrd')" title="Edit prd.json">📄 PRD</button>
    <button class="btn btn-sm" onclick="send('openMemories')">🧠 Memory</button>
    <button class="btn btn-sm" onclick="send('importPlan')" title="Import or append from Plan agent markdown">⬇ Plan</button>
    <button class="btn btn-sm btn-setup" onclick="send('setupProject')" title="Generate/regenerate AGENTS.md and plans/">⚙ Agents</button>
    <button class="btn btn-sm" onclick="send('openSettings')">⚙</button>
    <button class="btn btn-sm" onclick="send('refresh')">↻</button>
  </div>
</div>`;
}

function guardrailsPanel(guardrails: string[], boundaries: string[]): string {
	return `
<details class="guardrails-panel">
  <summary>🛡 Guardrails & Boundaries</summary>
  <div class="guardrails-body">
    ${guardrails.length ? `<div class="guardrails-section"><div class="guardrails-label">Rules injected in every prompt</div>${guardrails.map(g => `<div class="guardrail-item">• ${esc(g)}</div>`).join('')}</div>` : ''}
    ${boundaries.length ? `<div class="guardrails-section"><div class="guardrails-label">Paths agent must never touch</div>${boundaries.map(b => `<div class="guardrail-item boundary-item">🚫 ${esc(b)}</div>`).join('')}</div>` : ''}
    <button class="btn btn-sm" onclick="send('openSettings')" style="margin-top:6px">Edit in settings</button>
  </div>
</details>`;
}

function memoriesPanel(memories: string): string {
	return `
<details class="memories-panel">
  <summary>🧠 Project Memory <span class="mem-hint">(edit in .agent/memories.md)</span></summary>
  <pre class="memories-content">${esc(memories)}</pre>
</details>`;
}

function emptyState(): string {
	return `
<div class="empty-state">
  <div class="empty-icon">🚀</div>
  <div class="empty-title">No prd.json found</div>
  <div class="empty-sub">Generate one from a project description or import a Plan.</div>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button class="btn btn-primary" onclick="send('initProject')">Init Project</button>
    <button class="btn btn-primary" onclick="send('importPlan')" style="background:#1f6feb;border-color:#1f6feb">⬇ Import Plan</button>
  </div>
  <div class="empty-hint">Or place a <code>prd.json</code> in the workspace root</div>
</div>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function getKanbanHtml(
	prd: Prd | null,
	memories: string | null,
	logs: Record<string, TaskLog> = {},
	cfg: BoardConfig = { autoRun: false, maxLoops: 5, guardrails: [], boundaries: [], view: 'board' }
): string {

	let mainContent = '';
	if (!prd) {
		mainContent = emptyState();
	} else {
		const bar = statsBar(prd, cfg);
		if (cfg.view === 'history') {
			mainContent = bar + historyView(logs);
		} else if (cfg.view === 'epic') {
			mainContent = bar + epicView(prd, logs);
		} else {
			mainContent = bar + boardView(prd, logs, cfg.autoRun);
		}
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ralph Board</title>
<style>
:root {
  --bg:    var(--vscode-editor-background,#0d1117);
  --bg2:   var(--vscode-sideBar-background,#161b22);
  --bg3:   var(--vscode-input-background,#21262d);
  --border:var(--vscode-panel-border,#30363d);
  --text:  var(--vscode-editor-foreground,#c9d1d9);
  --text2: var(--vscode-descriptionForeground,#8b949e);
  --btn-bg:var(--vscode-button-background,#238636);
  --btn-h: var(--vscode-button-hoverBackground,#2ea043);
  --blue:#58a6ff;--green:#3fb950;--red:#f85149;--amber:#e3b341;
  --mono:var(--vscode-editor-font-family,'Cascadia Code','Fira Code',monospace);
  --r:6px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--vscode-font-family,-apple-system,'Segoe UI',sans-serif);font-size:var(--vscode-font-size,13px);overflow-x:auto}

/* STATS BAR */
.stats-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border-bottom:1px solid var(--border);flex-wrap:wrap;position:sticky;top:0;z-index:10}
.stats-left{flex:1;min-width:120px}
.stats-title{font-size:13px;font-weight:600}
.stats-desc{font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.stats-mid{display:flex;flex-direction:column;gap:4px}
.progress-row{display:flex;align-items:center;gap:7px}
.progress-track{width:100px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden}
.progress-fill{height:100%;background:var(--green);border-radius:2px;transition:width .4s}
.progress-label{font-size:11px;color:var(--text2)}
.progress-label strong{color:var(--green)}
.epics-row{display:flex;gap:3px;flex-wrap:wrap}
.epic-chip{font-size:10px;padding:1px 5px;border-radius:10px;background:rgba(88,166,255,.1);color:var(--blue);border:1px solid rgba(88,166,255,.25)}
.stats-actions{display:flex;gap:3px;margin-left:auto;flex-wrap:wrap;align-items:center}
.view-switcher{display:flex;gap:2px;background:var(--bg3);border-radius:5px;padding:2px}
.btn-view-active{background:var(--bg2)!important;color:var(--text)!important;border-color:var(--border)!important}

/* RUNNER */
.runner-badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;background:rgba(227,179,65,.15);color:var(--amber);border:1px solid rgba(227,179,65,.3);animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.btn-runner-on{background:rgba(248,81,73,.12);border-color:rgba(248,81,73,.4);color:var(--red)}
.btn-runner-on:hover{background:rgba(248,81,73,.22)!important}
.btn-runner-off{background:rgba(227,179,65,.1);border-color:rgba(227,179,65,.35);color:var(--amber)}
.btn-runner-off:hover{background:rgba(227,179,65,.2)!important}
.btn-github{background:rgba(139,148,158,.1);border-color:rgba(139,148,158,.3);color:var(--text2)}
.btn-github:hover{background:rgba(139,148,158,.2)!important;color:var(--text)!important}
.btn-add{background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.35);color:var(--green)}
.btn-add:hover{background:rgba(63,185,80,.2)!important}
.btn-setup{background:rgba(227,179,65,.08);border-color:rgba(227,179,65,.3);color:var(--amber)}
.btn-setup:hover{background:rgba(227,179,65,.18)!important}
/* ADD ISSUE MODAL */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100;display:flex;align-items:center;justify-content:center}
.modal{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px 22px;width:420px;max-width:95vw;display:flex;flex-direction:column;gap:12px}
.modal-title{font-size:14px;font-weight:600;color:var(--text)}
.modal-row{display:flex;flex-direction:column;gap:4px}
.modal-label{font-size:11px;color:var(--text2);font-weight:500}
.modal-input,.modal-select,.modal-textarea{background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:inherit;font-size:12px;padding:6px 8px;width:100%;outline:none;transition:border-color .15s}
.modal-input:focus,.modal-select:focus,.modal-textarea:focus{border-color:var(--blue)}
.modal-textarea{resize:vertical;min-height:60px;line-height:1.5}
.modal-select option{background:var(--bg2)}
.modal-row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.modal-footer{display:flex;justify-content:flex-end;gap:7px;margin-top:4px}
.btn-github:hover{background:rgba(139,148,158,.2)!important;color:var(--text)!important}

/* BOARD */
.board{display:flex;min-height:calc(100vh - 54px);align-items:flex-start}
.col{flex:1;min-width:200px;max-width:300px;display:flex;flex-direction:column;border-right:1px solid var(--border);transition:background .15s}
.col:last-child{border-right:none}
.col.drag-over{background:rgba(88,166,255,.04)}
.col-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 7px;background:var(--bg2);border-bottom:2px solid var(--accent,var(--border));position:sticky;top:46px;z-index:5}
.col-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text2)}
.col-count{font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--text2)}
.col-body{padding:6px;display:flex;flex-direction:column;gap:6px;min-height:80px}
.col-empty{font-size:11px;color:var(--text2);text-align:center;padding:20px 0;opacity:.4;border:1px dashed var(--border);border-radius:var(--r);margin:4px}

/* EPIC VIEW */
.epic-view{padding:12px;display:flex;flex-direction:column;gap:16px}
.epic-group{background:var(--bg2);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.epic-group-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border)}
.epic-group-title{font-size:13px;font-weight:600;color:var(--blue)}
.epic-group-meta{display:flex;align-items:center;gap:8px}
.epic-cols{display:flex;gap:0;flex-wrap:wrap}
.epic-col{flex:1;min-width:180px;padding:8px;border-right:1px solid var(--border)}
.epic-col:last-child{border-right:none}
.epic-col-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}

/* HISTORY VIEW */
.history-view{padding:12px}
.history-stats{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.hstat{display:flex;flex-direction:column;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 20px;min-width:80px}
.hstat-val{font-size:22px;font-weight:700;color:var(--text)}
.hstat-label{font-size:10px;color:var(--text2);margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
.history-table{width:100%;border-collapse:collapse;font-size:12px}
.history-table th{text-align:left;padding:6px 10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text2);border-bottom:1px solid var(--border);background:var(--bg2)}
.history-row{border-bottom:1px solid var(--border);transition:background .1s}
.history-row:hover{background:var(--bg2)}
.history-row td{padding:7px 10px;vertical-align:middle}
.history-status{width:24px;text-align:center}
.history-id{width:90px}
.history-dur{width:50px;color:var(--text2);font-family:var(--mono);font-size:11px}
.history-date{width:140px;color:var(--text2);font-size:11px}
.history-note{color:var(--text2);font-size:11px}
.history-title{font-weight:500}

/* CARD */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:9px 10px;transition:border-color .15s,transform .1s;cursor:grab}
.card:active{cursor:grabbing}
.card:hover{border-color:rgba(88,166,255,.45);transform:translateY(-1px)}
.card.dragging{opacity:.35;transform:scale(.97)}
.card[data-status="inprogress"]{border-left:3px solid var(--blue)}
.card[data-status="completed"]{border-left:3px solid var(--green);opacity:.65}
.card[data-status="blocked"]{border-left:3px solid var(--red)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;gap:6px}
.card-header-left{display:flex;flex-wrap:wrap;gap:3px;align-items:center;flex:1;min-width:0}
.card-header-right{display:flex;align-items:center;gap:4px;flex-shrink:0}
.card-id{font-family:var(--mono);font-size:10px;color:var(--text2);background:var(--bg3);padding:1px 5px;border-radius:4px;white-space:nowrap}
.card-epic{font-size:10px;padding:1px 5px;border-radius:10px;background:rgba(88,166,255,.1);color:var(--blue);border:1px solid rgba(88,166,255,.2)}
.card-label{font-size:10px;padding:1px 5px;border-radius:10px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)}
.priority-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.log-badge{font-size:10px;padding:1px 5px;border-radius:10px;font-weight:600}
.log-done{background:rgba(63,185,80,.15);color:var(--green);border:1px solid rgba(63,185,80,.3)}
.log-running{background:rgba(88,166,255,.15);color:var(--blue);border:1px solid rgba(88,166,255,.3)}
.card-title{font-size:12px;font-weight:500;line-height:1.35;margin-bottom:4px}
.card-desc{font-size:11px;color:var(--text2);line-height:1.4;margin-bottom:4px}
.card-summary{font-size:11px;color:var(--green);line-height:1.4;margin-bottom:4px;padding:4px 6px;background:rgba(63,185,80,.06);border-radius:4px;border-left:2px solid rgba(63,185,80,.4)}
.card-deps{font-size:10px;color:var(--amber);margin-bottom:4px}
.card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
.card-criteria{font-size:10px;color:var(--text2);position:relative;cursor:default}
.card-criteria.has-tooltip{cursor:help;text-decoration:underline dotted;text-underline-offset:2px}
.card-criteria.has-tooltip:hover::after{
  content:attr(data-tooltip);
  position:absolute;bottom:calc(100% + 6px);left:0;
  background:var(--bg);border:1px solid var(--border);border-radius:6px;
  padding:7px 10px;font-size:11px;color:var(--text);line-height:1.5;
  white-space:pre;min-width:200px;max-width:340px;word-break:break-word;
  white-space:pre-wrap;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,.3);
  pointer-events:none;
}
/* waiting pulse on inprogress badge */
.log-waiting{animation:pulse 1.5s ease-in-out infinite}
/* same-column reorder drop indicator */
.card.drop-above{border-top:2px solid var(--blue)!important}
.card.drop-below{border-bottom:2px solid var(--blue)!important}

/* BUTTONS */
.btn{font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;transition:background .1s,border-color .1s;white-space:nowrap}
.btn:hover:not(:disabled){background:var(--bg);border-color:var(--text2)}
.btn-run{background:rgba(88,166,255,.12);border-color:rgba(88,166,255,.4);color:var(--blue)}
.btn-run:hover{background:rgba(88,166,255,.22)!important}
.btn-done{background:rgba(63,185,80,.12);border-color:rgba(63,185,80,.4);color:var(--green)}
.btn-done:hover{background:rgba(63,185,80,.22)!important}
.btn-note{padding:3px 6px;color:var(--text2)}
.btn-note:hover{color:var(--amber)!important;border-color:var(--amber)!important}
.btn-reset{color:var(--text2)}
.btn-disabled{color:var(--text2);opacity:.35;cursor:not-allowed}
.btn-sm{font-size:11px;padding:3px 7px}
.btn-primary{background:var(--btn-bg);border-color:var(--btn-bg);color:#fff;font-size:13px;padding:7px 18px;margin-top:8px}
.btn-primary:hover{background:var(--btn-h)!important;border-color:var(--btn-h)!important}

/* EMPTY */
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;gap:8px;text-align:center;padding:40px}
.empty-icon{font-size:52px;margin-bottom:4px}
.empty-title{font-size:18px;font-weight:600}
.empty-sub{font-size:13px;color:var(--text2);max-width:300px;line-height:1.5}
.empty-hint{font-size:11px;color:var(--text2);margin-top:8px;opacity:.7}
.empty-hint code{background:var(--bg3);padding:1px 4px;border-radius:3px}

/* GUARDRAILS */
.guardrails-panel{border-top:1px solid var(--border);background:var(--bg2)}
.guardrails-panel summary{padding:7px 14px;cursor:pointer;color:var(--text2);font-size:12px;user-select:none}
.guardrails-panel summary:hover{color:var(--text)}
.guardrails-body{padding:8px 14px 12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
.guardrails-section{display:flex;flex-direction:column;gap:3px}
.guardrails-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text2);margin-bottom:2px}
.guardrail-item{font-size:11px;color:var(--text);padding:2px 0}
.boundary-item{color:var(--red);font-family:var(--mono)}

/* MEMORIES */
.memories-panel{border-top:1px solid var(--border);background:var(--bg2)}
.memories-panel summary{padding:7px 14px;cursor:pointer;color:var(--text2);font-size:12px;user-select:none}
.memories-panel summary:hover{color:var(--text)}
.mem-hint{font-size:10px;opacity:.6;margin-left:6px}
.memories-content{font-family:var(--mono);font-size:11px;color:var(--text2);padding:10px 14px;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow-y:auto;border-top:1px solid var(--border);line-height:1.6}

/* DRAG GHOST */
.drag-ghost{position:fixed;top:-9999px;left:-9999px;background:var(--bg2);border:1px solid var(--blue);border-radius:var(--r);padding:8px 12px;font-size:12px;font-weight:500;color:var(--text);pointer-events:none;z-index:9999}
</style>
</head>
<body>
${mainContent}
${prd && (cfg.guardrails.length || cfg.boundaries.length) ? guardrailsPanel(cfg.guardrails, cfg.boundaries) : ''}
${prd && memories ? memoriesPanel(memories) : ''}
<div class="drag-ghost" id="dragGhost"></div>

<!-- Add Issue Modal -->
<div class="modal-overlay" id="addModal" style="display:none" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">＋ New Issue</div>
    <div class="modal-row">
      <label class="modal-label">Title *</label>
      <input class="modal-input" id="mi-title" placeholder="Short descriptive title" />
    </div>
    <div class="modal-row">
      <label class="modal-label">Description</label>
      <textarea class="modal-textarea" id="mi-desc" placeholder="What needs to be done?"></textarea>
    </div>
    <div class="modal-row-2">
      <div class="modal-row">
        <label class="modal-label">Epic</label>
        <input class="modal-input" id="mi-epic" placeholder="e.g. Auth, Backend…" />
      </div>
      <div class="modal-row">
        <label class="modal-label">Priority</label>
        <select class="modal-select" id="mi-priority">
          <option value="P0">🔴 P0 — Critical</option>
          <option value="P1">🟠 P1 — High</option>
          <option value="P2" selected>🔵 P2 — Medium</option>
          <option value="P3">⚪ P3 — Low</option>
        </select>
      </div>
    </div>
    <div class="modal-row">
      <label class="modal-label">Acceptance Criteria <span style="opacity:.5">(one per line)</span></label>
      <textarea class="modal-textarea" id="mi-criteria" placeholder="Feature works as expected&#10;Tests pass&#10;No console errors"></textarea>
    </div>
    <div class="modal-row">
      <label class="modal-label">Labels <span style="opacity:.5">(comma-separated)</span></label>
      <input class="modal-input" id="mi-labels" placeholder="e.g. frontend, api" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-run" onclick="submitAddIssue()">Add Issue</button>
    </div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
function send(type, id) { vscode.postMessage({ type, id }); }

// ── Add Issue Modal ──────────────────────────────────────────────────────────
function showAddIssue() {
  document.getElementById('addModal').style.display = 'flex';
  document.getElementById('mi-title').focus();
}
function closeModal() {
  document.getElementById('addModal').style.display = 'none';
  ['mi-title','mi-desc','mi-epic','mi-criteria','mi-labels'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('mi-priority').value = 'P2';
}
function submitAddIssue() {
  const title = document.getElementById('mi-title').value.trim();
  if (!title) { document.getElementById('mi-title').focus(); return; }
  const criteria = document.getElementById('mi-criteria').value
    .split('\\n').map(l => l.trim()).filter(Boolean);
  const labels = document.getElementById('mi-labels').value
    .split(',').map(l => l.trim()).filter(Boolean);
  vscode.postMessage({
    type: 'addIssue',
    issue: {
      title,
      description: document.getElementById('mi-desc').value.trim(),
      epic:        document.getElementById('mi-epic').value.trim() || undefined,
      priority:    document.getElementById('mi-priority').value,
      acceptanceCriteria: criteria,
      labels,
    }
  });
  closeModal();
}
// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); }
  if (e.key === 'Enter' && e.ctrlKey && document.getElementById('addModal').style.display !== 'none') {
    submitAddIssue();
  }
});

// ── Drag & Drop (column change + same-column reorder) ─────────────────────────
let dragId = null, dragEl = null, dragSourceCol = null;
const ghost = document.getElementById('dragGhost');

function onDragStart(e) {
  dragEl = e.currentTarget;
  dragId = dragEl.dataset.id;
  dragSourceCol = dragEl.closest('.col')?.dataset.col ?? null;
  dragEl.classList.add('dragging');
  ghost.textContent = dragEl.querySelector('.card-id').textContent + '  ' + dragEl.querySelector('.card-title').textContent.slice(0, 30);
  e.dataTransfer.setDragImage(ghost, 0, 0);
  e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(e) {
  dragEl?.classList.remove('dragging');
  document.querySelectorAll('.card.drop-above,.card.drop-below').forEach(c => {
    c.classList.remove('drop-above','drop-below');
  });
  dragEl = null; dragId = null; dragSourceCol = null;
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function onDragEnter(e) {
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) { e.currentTarget.classList.remove('drag-over'); }
}
function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  const newStatus = col.dataset.col;
  col.classList.remove('drag-over');
  if (!dragId || !newStatus) { return; }
  // Cross-column move
  if (dragEl?.dataset.status !== newStatus) {
    vscode.postMessage({ type: 'moveCard', id: dragId, status: newStatus });
  }
}

// Same-column card reorder
function onCardDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (!dragEl || target === dragEl) { return; }
  // Only reorder within same column
  const targetCol = target.closest('.col')?.dataset.col;
  if (targetCol !== dragSourceCol) { return; }
  // Show drop indicator above or below
  document.querySelectorAll('.card.drop-above,.card.drop-below').forEach(c => {
    c.classList.remove('drop-above','drop-below');
  });
  const rect   = target.getBoundingClientRect();
  const midY   = rect.top + rect.height / 2;
  if (e.clientY < midY) {
    target.classList.add('drop-above');
  } else {
    target.classList.add('drop-below');
  }
}
function onCardDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  if (!dragEl || target === dragEl) { return; }
  const targetCol = target.closest('.col')?.dataset.col;
  if (targetCol !== dragSourceCol) { return; }
  const rect   = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  vscode.postMessage({
    type: 'reorderCard',
    id:       dragId,
    targetId: target.dataset.id,
    before,
  });
}
</script>
</body>
</html>`;
}

function esc(s: string): string {
	return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
