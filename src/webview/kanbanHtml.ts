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

function card(issue: Issue, log: TaskLog | null): string {
	const pc = PRIORITY_DOT[issue.priority] ?? '#6e7681';
	const pl = PRIORITY_LABEL[issue.priority] ?? issue.priority;
	const deps = issue.dependencies?.length
		? `<div class="card-deps">⛓ ${issue.dependencies.join(', ')}</div>` : '';
	const epic = issue.epic ? `<span class="card-epic">${esc(issue.epic)}</span>` : '';
	const labels = (issue.labels ?? []).map(l => `<span class="card-label">${esc(l)}</span>`).join('');

	let logBadge = '';
	if (log?.status === 'completed' && log.durationMin !== undefined) {
		logBadge = `<span class="log-badge log-done">✓ ${log.durationMin}m</span>`;
	} else if (log?.status === 'inprogress') {
		logBadge = `<span class="log-badge log-running">⏱ running</span>`;
	}

	const summaryHtml = (log?.note || log?.summary)
		? `<div class="card-summary">${esc((log.note || log.summary || '').slice(0, 140))}${(log.note || log.summary || '').length > 140 ? '…' : ''}</div>`
		: '';

	let actions = '';
	if (issue.status === 'todo') {
		actions = `<button class="btn btn-run" onclick="send('runTask','${issue.id}')">▶ Run</button>`;
	} else if (issue.status === 'blocked') {
		actions = `<button class="btn btn-disabled" disabled>⛓ Blocked</button>`;
	} else if (issue.status === 'inprogress') {
		actions = `<button class="btn btn-done" onclick="send('markDone','${issue.id}')">✓ Mark done</button>`;
	} else {
		actions = `
			<button class="btn btn-note" onclick="send('addNote','${issue.id}')" title="Add note to memory">✎</button>
			<button class="btn btn-reset" onclick="send('resetTask','${issue.id}')">↩ Reset</button>`;
	}

	return `
<div class="card" draggable="true"
     data-id="${issue.id}"
     data-status="${issue.status}"
     ondragstart="onDragStart(event)"
     ondragend="onDragEnd(event)">
  <div class="card-header">
    <div class="card-header-left">
      <span class="card-id">${esc(issue.id)}</span>
      ${epic}${labels}
    </div>
    <div class="card-header-right">
      <span class="priority-dot" style="background:${pc}" title="${pl}"></span>
      ${logBadge}
    </div>
  </div>
  <div class="card-title">${esc(issue.title)}</div>
  ${issue.description ? `<div class="card-desc">${esc(issue.description.slice(0, 100))}${issue.description.length > 100 ? '…' : ''}</div>` : ''}
  ${summaryHtml}
  ${deps}
  <div class="card-footer">
    <span class="card-criteria">${issue.acceptanceCriteria?.length ?? 0} criteria</span>
    ${actions}
  </div>
</div>`;
}

function column(col: typeof STATUS_COLS[0], issues: Issue[], logs: Record<string, TaskLog>, autoRun: boolean): string {
	const runnerBadge = col.id === 'inprogress' && autoRun
		? `<span class="runner-badge">⚡ auto</span>` : '';
	return `
<div class="col"
     data-col="${col.id}"
     ondragover="onDragOver(event)"
     ondragenter="onDragEnter(event)"
     ondragleave="onDragLeave(event)"
     ondrop="onDrop(event)">
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
}

function statsBar(prd: Prd, autoRun: boolean, maxLoops: number): string {
	const total = prd.issues.length;
	const done  = prd.issues.filter(i => i.status === 'completed').length;
	const pct   = total ? Math.round((done / total) * 100) : 0;
	const epics = [...new Set(prd.issues.map(i => i.epic || 'General'))];

	const runnerBtn = autoRun
		? `<button class="btn btn-sm btn-runner-on" onclick="send('stopRunner')">⏹ Stop runner</button>`
		: `<button class="btn btn-sm btn-runner-off" onclick="send('startRunner')">⚡ Auto-run</button>`;

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
    <div class="epics-row">
      ${epics.map(e => `<span class="epic-chip">${esc(e)}</span>`).join('')}
    </div>
  </div>
  <div class="stats-actions">
    ${runnerBtn}
    <button class="btn btn-sm btn-github" onclick="send('pushToGitHub')" title="Create pending issues in GitHub">⬆ GitHub</button>
    <button class="btn btn-sm btn-github" onclick="send('syncFromGitHub')" title="Sync closed issues from GitHub">⬇ Sync</button>
    <button class="btn btn-sm" onclick="send('openPrd')" title="Edit prd.json">📄 PRD</button>
    <button class="btn btn-sm" onclick="send('openMemories')" title="Edit memories">🧠 Memory</button>
    <button class="btn btn-sm" onclick="send('openSettings')" title="Guardrails & config">⚙</button>
    <button class="btn btn-sm" onclick="send('refresh')">↻</button>
  </div>
</div>`;
}

function guardrailsPanel(guardrails: string[], boundaries: string[]): string {
	if (!guardrails.length && !boundaries.length) { return ''; }
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
  <div class="empty-sub">Describe your project goal to generate one automatically.</div>
  <button class="btn btn-primary" onclick="send('initProject')">Init Project</button>
  <div class="empty-hint">Or place a <code>prd.json</code> in the workspace root</div>
</div>`;
}

export interface BoardConfig {
	autoRun:    boolean;
	maxLoops:   number;
	guardrails: string[];
	boundaries: string[];
}

export function getKanbanHtml(
	prd: Prd | null,
	memories: string | null,
	logs: Record<string, TaskLog> = {},
	cfg: BoardConfig = { autoRun: false, maxLoops: 5, guardrails: [], boundaries: [] }
): string {
	const bodyHtml = prd
		? `${statsBar(prd, cfg.autoRun, cfg.maxLoops)}
<div class="board">
  ${STATUS_COLS.map(c => column(c, prd.issues.filter(i => i.status === c.id), logs, cfg.autoRun)).join('')}
</div>`
		: emptyState();

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
  --blue:#58a6ff; --green:#3fb950; --red:#f85149; --amber:#e3b341;
  --mono:var(--vscode-editor-font-family,'Cascadia Code','Fira Code',monospace);
  --r:6px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--vscode-font-family,-apple-system,'Segoe UI',sans-serif);font-size:var(--vscode-font-size,13px);overflow-x:auto}

/* STATS BAR */
.stats-bar{display:flex;align-items:center;gap:14px;padding:9px 14px;background:var(--bg2);border-bottom:1px solid var(--border);flex-wrap:wrap;position:sticky;top:0;z-index:10}
.stats-left{flex:1;min-width:140px}
.stats-title{font-size:13px;font-weight:600}
.stats-desc{font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
.stats-mid{display:flex;flex-direction:column;gap:4px}
.progress-row{display:flex;align-items:center;gap:8px}
.progress-track{width:110px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden}
.progress-fill{height:100%;background:var(--green);border-radius:2px;transition:width .4s}
.progress-label{font-size:11px;color:var(--text2)}
.progress-label strong{color:var(--green)}
.epics-row{display:flex;gap:4px;flex-wrap:wrap}
.epic-chip{font-size:10px;padding:1px 6px;border-radius:10px;background:rgba(88,166,255,.1);color:var(--blue);border:1px solid rgba(88,166,255,.25)}
.stats-actions{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap}

.btn-github{background:rgba(139,148,158,.1);border-color:rgba(139,148,158,.35);color:var(--text2)}
.btn-github:hover{background:rgba(139,148,158,.2)!important;color:var(--text)!important}
/* RUNNER */
.runner-badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;background:rgba(227,179,65,.15);color:var(--amber);border:1px solid rgba(227,179,65,.3);animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.btn-runner-on{background:rgba(248,81,73,.12);border-color:rgba(248,81,73,.4);color:var(--red)}
.btn-runner-on:hover{background:rgba(248,81,73,.22)!important}
.btn-runner-off{background:rgba(227,179,65,.1);border-color:rgba(227,179,65,.35);color:var(--amber)}
.btn-runner-off:hover{background:rgba(227,179,65,.2)!important}

/* BOARD */
.board{display:flex;min-height:calc(100vh - 54px);align-items:flex-start}

/* COLUMN */
.col{flex:1;min-width:200px;max-width:300px;display:flex;flex-direction:column;border-right:1px solid var(--border);transition:background .15s}
.col:last-child{border-right:none}
.col.drag-over{background:rgba(88,166,255,.04)}
.col-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 7px;background:var(--bg2);border-bottom:2px solid var(--accent,var(--border));position:sticky;top:46px;z-index:5}
.col-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text2)}
.col-count{font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--text2)}
.col-body{padding:6px;display:flex;flex-direction:column;gap:6px;min-height:80px}
.col-empty{font-size:11px;color:var(--text2);text-align:center;padding:20px 0;opacity:.4;border:1px dashed var(--border);border-radius:var(--r);margin:4px}

/* CARD */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:9px 10px;transition:border-color .15s,transform .1s,opacity .15s;cursor:grab}
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
.card-criteria{font-size:10px;color:var(--text2)}

/* BUTTONS */
.btn{font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);cursor:pointer;transition:background .1s,border-color .1s;white-space:nowrap}
.btn:hover:not(:disabled){background:var(--bg);border-color:var(--text2)}
.btn-run{background:rgba(88,166,255,.12);border-color:rgba(88,166,255,.4);color:var(--blue)}
.btn-run:hover{background:rgba(88,166,255,.22)!important}
.btn-done{background:rgba(63,185,80,.12);border-color:rgba(63,185,80,.4);color:var(--green)}
.btn-done:hover{background:rgba(63,185,80,.22)!important}
.btn-note{padding:3px 6px;color:var(--text2);border-color:var(--border)}
.btn-note:hover{color:var(--amber)!important;border-color:var(--amber)!important}
.btn-reset{color:var(--text2)}
.btn-disabled{color:var(--text2);opacity:.35;cursor:not-allowed}
.btn-sm{font-size:11px;padding:3px 7px}
.btn-primary{background:var(--btn-bg);border-color:var(--btn-bg);color:#fff;font-size:13px;padding:7px 18px;margin-top:8px}
.btn-primary:hover{background:var(--btn-h)!important;border-color:var(--btn-h)!important}

/* EMPTY STATE */
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
.drag-ghost{position:fixed;top:-9999px;left:-9999px;background:var(--bg2);border:1px solid var(--blue);border-radius:var(--r);padding:8px 12px;font-size:12px;font-weight:500;color:var(--text);pointer-events:none;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4)}
</style>
</head>
<body>
${bodyHtml}
${cfg.guardrails.length || cfg.boundaries.length ? guardrailsPanel(cfg.guardrails, cfg.boundaries) : ''}
${memories ? memoriesPanel(memories) : ''}

<div class="drag-ghost" id="dragGhost"></div>

<script>
const vscode = acquireVsCodeApi();
function send(type, id) { vscode.postMessage({ type, id }); }

// ── Drag & Drop ──────────────────────────────────────────────────────────────
let dragId    = null;
let dragEl    = null;
const ghost   = document.getElementById('dragGhost');

function onDragStart(e) {
  dragEl = e.currentTarget;
  dragId = dragEl.dataset.id;
  dragEl.classList.add('dragging');

  // Custom ghost
  ghost.textContent = dragEl.querySelector('.card-id').textContent
    + '  ' + dragEl.querySelector('.card-title').textContent.slice(0, 30);
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 0, 0);
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  dragEl?.classList.remove('dragging');
  dragEl = null;
  dragId = null;
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function onDragEnter(e) {
  const col = e.currentTarget;
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
  col.classList.add('drag-over');
}

function onDragLeave(e) {
  // Only remove if leaving the column entirely (not entering a child)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  const col    = e.currentTarget;
  const newStatus = col.dataset.col;
  col.classList.remove('drag-over');
  if (!dragId || !newStatus) { return; }
  if (dragEl?.dataset.status === newStatus) { return; }
  vscode.postMessage({ type: 'moveCard', id: dragId, status: newStatus });
}
</script>
</body>
</html>`;
}

function esc(s: string): string {
	return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
