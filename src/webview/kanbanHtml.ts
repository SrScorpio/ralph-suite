// ── Types ─────────────────────────────────────────────────────────────────────

export interface Issue {
	id: string; title: string; description: string; epic?: string;
	priority: 'P0'|'P1'|'P2'|'P3'; status: 'todo'|'inprogress'|'completed'|'blocked';
	acceptanceCriteria: string[]; dependencies: string[]; labels: string[];
}
export interface Prd { project: string; description: string; version: string; issues: Issue[]; }
export interface TaskLog {
	id: string; title: string; status: string; startedAt: string;
	completedAt?: string; durationMin?: number; note?: string; summary?: string;
}
export interface BoardConfig {
	autoRun: boolean; maxLoops: number; guardrails: string[]; boundaries: string[];
	view: 'board'|'epic'|'history';
}

// ── Shell HTML — loaded ONCE, never replaced ──────────────────────────────────

export function getShellHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:;">
<title>Ralph Board</title>
<style>
:root {
  --bg:    var(--vscode-editor-background,#0d1117);
  --bg2:   var(--vscode-sideBar-background,#161b22);
  --bg3:   var(--vscode-input-background,#21262d);
  --border:var(--vscode-panel-border,#30363d);
  --text:  var(--vscode-editor-foreground,#e6edf3);
  --text2: var(--vscode-descriptionForeground,#8b949e);
  --blue:  var(--vscode-textLink-foreground,#58a6ff);
  --green: var(--vscode-testing-iconPassed,#3fb950);
  --red:   var(--vscode-testing-iconFailed,#f85149);
  --amber: var(--vscode-editorWarning-foreground,#e3b341);
  --purple:#8957e5; --mono: var(--vscode-editor-fontFamily,monospace);
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--vscode-font-family,sans-serif);font-size:13px;height:100vh;overflow:hidden;display:flex;flex-direction:column}
#root{flex:1;overflow:auto;padding:0}
/* Empty state */
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:10px;color:var(--text2)}
.empty-icon{font-size:48px}
.empty-title{font-size:18px;font-weight:600;color:var(--text)}
.empty-sub{font-size:13px;text-align:center;max-width:320px}
.empty-hint{font-size:11px;opacity:.6}
code{background:var(--bg3);padding:1px 5px;border-radius:3px;font-family:var(--mono);font-size:11px}
/* Buttons */
.btn{background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text);cursor:pointer;font-family:inherit;font-size:12px;padding:4px 10px;transition:background .15s}
.btn:hover{background:var(--bg2)!important}
.btn:disabled{opacity:.45;cursor:default}
.btn-primary{background:var(--green);border-color:var(--green);color:#fff;font-weight:600;padding:7px 18px;font-size:13px}
.btn-primary:hover{background:#2ea043!important}
.btn-run{background:rgba(56,139,253,.15);border-color:rgba(56,139,253,.4);color:var(--blue)}
.btn-done{background:rgba(63,185,80,.12);border-color:rgba(63,185,80,.35);color:var(--green)}
.btn-note{background:transparent;border-color:var(--border);color:var(--text2);padding:3px 7px}
.btn-reset{background:transparent;border-color:var(--border);color:var(--text2);padding:3px 7px}
.btn-disabled{background:rgba(110,118,129,.1);border-color:rgba(110,118,129,.3);color:var(--text2)}
.btn-sm{font-size:11px;padding:3px 8px}
.btn-github{background:rgba(139,148,158,.1);border-color:rgba(139,148,158,.3);color:var(--text2)}
.btn-add{background:rgba(63,185,80,.1);border-color:rgba(63,185,80,.35);color:var(--green)}
.btn-setup{background:rgba(227,179,65,.08);border-color:rgba(227,179,65,.3);color:var(--amber)}
.btn-setup:hover{background:rgba(227,179,65,.18)!important}
.btn-optimize{background:rgba(188,140,255,.08);border-color:rgba(188,140,255,.3);color:#bc8cff}
.btn-optimize:hover{background:rgba(188,140,255,.18)!important}
.btn-runner-on{background:rgba(248,81,73,.12);border-color:rgba(248,81,73,.4);color:var(--red)}
.btn-runner-off{background:rgba(227,179,65,.1);border-color:rgba(227,179,65,.35);color:var(--amber)}
.btn-view-active{background:var(--bg);border-color:var(--blue);color:var(--blue)}
/* Board */
.board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px;height:100%}
.col{background:var(--bg2);border-radius:8px;display:flex;flex-direction:column;min-height:0;border:2px solid transparent;transition:border-color .15s}
.col.drag-over{border-color:var(--blue)}
.col-header{padding:10px 12px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)}
.col-title{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2)}
.col-count{background:var(--bg3);border-radius:10px;padding:1px 7px;font-size:11px;color:var(--text2)}
.col-body{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
/* Cards */
.card{background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:10px 11px;cursor:grab;transition:border-color .15s,opacity .15s;user-select:none}
.card:hover{border-color:var(--blue)}
.card.dragging{opacity:.4}
.card.drop-above{border-top:2px solid var(--blue)!important}
.card.drop-below{border-bottom:2px solid var(--blue)!important}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.card-header-left{display:flex;gap:5px;align-items:center;flex-wrap:wrap;min-width:0}
.card-header-right{display:flex;gap:5px;align-items:center;flex-shrink:0}
.card-id{font-size:10px;font-family:var(--mono);color:var(--text2);background:var(--bg3);padding:1px 5px;border-radius:3px}
.card-epic{font-size:10px;background:rgba(137,87,229,.18);color:var(--purple);padding:1px 5px;border-radius:3px}
.card-label{font-size:10px;background:var(--bg3);color:var(--text2);padding:1px 5px;border-radius:3px}
.card-title{font-size:13px;font-weight:500;line-height:1.4;margin-bottom:3px;cursor:pointer}
.card-title:hover{color:var(--blue)}
.card-desc{font-size:11px;color:var(--text2);line-height:1.4;margin-bottom:4px}
.card-summary{font-size:11px;color:var(--green);line-height:1.4;margin-bottom:4px;font-style:italic}
.card-deps{font-size:10px;color:var(--amber);margin-bottom:4px}
.card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
.card-criteria{font-size:10px;color:var(--text2);position:relative;cursor:default}
.card-criteria.has-tooltip{cursor:help;text-decoration:underline dotted;text-underline-offset:2px}
.card-criteria.has-tooltip:hover::after{
  content:attr(data-tooltip);position:absolute;bottom:calc(100% + 6px);left:0;
  background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 10px;
  font-size:11px;color:var(--text);line-height:1.5;white-space:pre-wrap;min-width:200px;
  max-width:340px;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;
}
.priority-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.log-badge{font-size:10px;padding:1px 5px;border-radius:3px;font-family:var(--mono)}
.log-done{background:rgba(63,185,80,.15);color:var(--green)}
.log-running{background:rgba(227,179,65,.15);color:var(--amber)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.log-waiting{animation:pulse 1.5s ease-in-out infinite}
/* Stats bar */
.stats-bar{padding:8px 12px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:5px}
.stats-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.project-title{font-weight:700;font-size:14px}
.project-desc{font-size:11px;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.progress-bar{width:80px;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s}
.progress-pct{font-size:11px;color:var(--text2)}
.epics-row{display:flex;gap:5px;flex-wrap:wrap}
.epic-chip{font-size:10px;background:rgba(137,87,229,.15);color:var(--purple);padding:1px 7px;border-radius:10px}
.stats-actions{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.view-switcher{display:flex;gap:2px;background:var(--bg3);border-radius:5px;padding:2px}
/* Epic view */
.epic-group{margin:10px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)}
.epic-group-header{padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)}
.epic-group-title{font-weight:600;color:var(--purple)}
.epic-progress{font-size:11px;color:var(--text2)}
.epic-cards{padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}
/* History */
.history-table{width:100%;border-collapse:collapse;font-size:12px}
.history-table th{text-align:left;padding:8px 12px;border-bottom:2px solid var(--border);color:var(--text2);font-weight:600;white-space:nowrap}
.history-table td{padding:7px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
.history-table tr:hover td{background:var(--bg2)}
.dur-badge{background:var(--bg3);padding:2px 7px;border-radius:10px;font-size:10px;font-family:var(--mono)}
/* Guardrails / Memories panels */
.guardrails-panel,.memories-panel{border-top:1px solid var(--border)}
summary{padding:8px 14px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text2);user-select:none;list-style:none}
summary:hover{color:var(--text)}
.guardrails-body{padding:8px 14px 12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
.guardrails-section{display:flex;flex-direction:column;gap:3px}
.guardrails-label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);font-weight:600;margin-bottom:2px}
.guardrail-item{font-size:11px;color:var(--text);padding:2px 0}
.boundary-item{color:var(--red)}
.memories-content{font-family:var(--mono);font-size:11px;color:var(--text2);padding:10px 14px;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow-y:auto;border-top:1px solid var(--border);line-height:1.6}
.mem-hint{font-size:10px;font-weight:400;opacity:.6;margin-left:6px}
/* Drag ghost */
.drag-ghost{position:fixed;top:-999px;left:-999px;background:var(--bg2);border:1px solid var(--blue);border-radius:5px;padding:5px 10px;font-size:12px;color:var(--text);pointer-events:none;white-space:nowrap;z-index:9999}
/* Modals */
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
</style>
</head>
<body>
<div id="root"><div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-title">Loading...</div></div></div>
<div class="drag-ghost" id="dragGhost"></div>

<!-- Add Issue Modal -->
<div class="modal-overlay" id="addModal" style="display:none" onclick="if(event.target===this)closeAddModal()">
  <div class="modal">
    <div class="modal-title">＋ New Issue</div>
    <div class="modal-row"><label class="modal-label">Title *</label><input class="modal-input" id="mi-title" placeholder="Short descriptive title"/></div>
    <div class="modal-row"><label class="modal-label">Description</label><textarea class="modal-textarea" id="mi-desc" placeholder="What needs to be done?"></textarea></div>
    <div class="modal-row-2">
      <div class="modal-row"><label class="modal-label">Epic</label><input class="modal-input" id="mi-epic" placeholder="e.g. Auth, Backend…"/></div>
      <div class="modal-row"><label class="modal-label">Priority</label><select class="modal-select" id="mi-priority"><option value="P0">🔴 P0</option><option value="P1">🟠 P1</option><option value="P2" selected>🔵 P2</option><option value="P3">⚪ P3</option></select></div>
    </div>
    <div class="modal-row"><label class="modal-label">Acceptance Criteria (one per line)</label><textarea class="modal-textarea" id="mi-criteria"></textarea></div>
    <div class="modal-row"><label class="modal-label">Labels (comma-separated)</label><input class="modal-input" id="mi-labels"/></div>
    <div class="modal-footer"><button class="btn" onclick="closeAddModal()">Cancel</button><button class="btn btn-run" onclick="submitAddIssue()">Add Issue</button></div>
  </div>
</div>

<!-- Edit Issue Modal -->
<div class="modal-overlay" id="editModal" style="display:none" onclick="if(event.target===this)closeEditModal()">
  <div class="modal" style="width:480px">
    <div class="modal-title">✎ Edit Issue</div>
    <input type="hidden" id="em-id"/>
    <div class="modal-row"><label class="modal-label">Title *</label><input class="modal-input" id="em-title"/></div>
    <div class="modal-row"><label class="modal-label">Description</label><textarea class="modal-textarea" id="em-desc" style="min-height:80px"></textarea></div>
    <div class="modal-row-2">
      <div class="modal-row"><label class="modal-label">Epic</label><input class="modal-input" id="em-epic"/></div>
      <div class="modal-row"><label class="modal-label">Priority</label><select class="modal-select" id="em-priority"><option value="P0">🔴 P0</option><option value="P1">🟠 P1</option><option value="P2">🔵 P2</option><option value="P3">⚪ P3</option></select></div>
    </div>
    <div class="modal-row"><label class="modal-label">Acceptance Criteria (one per line)</label><textarea class="modal-textarea" id="em-criteria" style="min-height:80px"></textarea></div>
    <div class="modal-row-2">
      <div class="modal-row"><label class="modal-label">Labels (comma-separated)</label><input class="modal-input" id="em-labels"/></div>
      <div class="modal-row"><label class="modal-label">Dependencies (comma-separated IDs)</label><input class="modal-input" id="em-deps"/></div>
    </div>
    <div class="modal-footer"><button class="btn" onclick="closeEditModal()">Cancel</button><button class="btn btn-run" onclick="submitEditIssue()">Save</button></div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
function send(type, id) { vscode.postMessage({ type, id }); }

// ── Receive data updates from extension via postMessage ───────────────────────
window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object' || !msg.type) { return; }
  if (msg.type === 'update') { renderBoard(msg.data); return; }
  if (msg.type === 'openAddModal')  { showAddIssue(); return; }
  if (msg.type === 'openEditModal') { showEditModal(msg.issue); return; }
});

// ── Board renderer ────────────────────────────────────────────────────────────
function renderBoard(data) {
  if (!data) { return; }
  document.getElementById('root').innerHTML = data.html;
}

// ── Add Issue Modal ───────────────────────────────────────────────────────────
function showAddIssue() {
  document.getElementById('addModal').style.display = 'flex';
  document.getElementById('mi-title').focus();
}
function closeAddModal() {
  document.getElementById('addModal').style.display = 'none';
  ['mi-title','mi-desc','mi-epic','mi-criteria','mi-labels'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('mi-priority').value = 'P2';
}
function submitAddIssue() {
  const title = document.getElementById('mi-title').value.trim();
  if (!title) { document.getElementById('mi-title').focus(); return; }
  vscode.postMessage({ type: 'addIssue', issue: {
    title,
    description: document.getElementById('mi-desc').value.trim(),
    epic: document.getElementById('mi-epic').value.trim() || undefined,
    priority: document.getElementById('mi-priority').value,
    acceptanceCriteria: document.getElementById('mi-criteria').value.split('\\n').map(l=>l.trim()).filter(Boolean),
    labels: document.getElementById('mi-labels').value.split(',').map(l=>l.trim()).filter(Boolean),
  }});
  closeAddModal();
}

// ── Edit Issue Modal ──────────────────────────────────────────────────────────
function showEditModal(issue) {
  document.getElementById('em-id').value       = issue.id ?? '';
  document.getElementById('em-title').value    = issue.title ?? '';
  document.getElementById('em-desc').value     = issue.description ?? '';
  document.getElementById('em-epic').value     = issue.epic ?? '';
  document.getElementById('em-priority').value = issue.priority ?? 'P2';
  document.getElementById('em-criteria').value = (issue.acceptanceCriteria ?? []).join('\\n');
  document.getElementById('em-labels').value   = (issue.labels ?? []).join(', ');
  document.getElementById('em-deps').value     = (issue.dependencies ?? []).join(', ');
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('em-title').focus();
}
function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }
function submitEditIssue() {
  const id = document.getElementById('em-id').value;
  if (!id) { return; }
  vscode.postMessage({ type: 'editIssue', id, fields: {
    title:              document.getElementById('em-title').value.trim(),
    description:        document.getElementById('em-desc').value.trim(),
    epic:               document.getElementById('em-epic').value.trim() || undefined,
    priority:           document.getElementById('em-priority').value,
    acceptanceCriteria: document.getElementById('em-criteria').value.split('\\n').map(l=>l.trim()).filter(Boolean),
    labels:             document.getElementById('em-labels').value.split(',').map(l=>l.trim()).filter(Boolean),
    dependencies:       document.getElementById('em-deps').value.split(',').map(l=>l.trim()).filter(Boolean),
  }});
  closeEditModal();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const addOpen  = document.getElementById('addModal').style.display  !== 'none';
  const editOpen = document.getElementById('editModal').style.display !== 'none';
  if (e.key === 'Escape') { closeAddModal(); closeEditModal(); }
  if (e.key === 'Enter' && e.ctrlKey) {
    if (addOpen)  { submitAddIssue(); }
    if (editOpen) { submitEditIssue(); }
  }
});

// ── Drag & Drop ───────────────────────────────────────────────────────────────
let dragId = null, dragEl = null, dragSourceCol = null;
const ghost = document.getElementById('dragGhost');
function onDragStart(e) {
  dragEl = e.currentTarget; dragId = dragEl.dataset.id;
  dragSourceCol = dragEl.closest('.col')?.dataset.col ?? null;
  dragEl.classList.add('dragging');
  ghost.textContent = dragEl.querySelector('.card-id').textContent + '  ' + dragEl.querySelector('.card-title').textContent.slice(0,30);
  e.dataTransfer.setDragImage(ghost, 0, 0);
  e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(e) {
  dragEl?.classList.remove('dragging');
  document.querySelectorAll('.card.drop-above,.card.drop-below').forEach(c=>c.classList.remove('drop-above','drop-below'));
  dragEl = null; dragId = null; dragSourceCol = null;
  document.querySelectorAll('.col').forEach(c=>c.classList.remove('drag-over'));
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function onDragEnter(e) { document.querySelectorAll('.col').forEach(c=>c.classList.remove('drag-over')); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { if(!e.currentTarget.contains(e.relatedTarget)){ e.currentTarget.classList.remove('drag-over'); } }
function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget; const newStatus = col.dataset.col;
  col.classList.remove('drag-over');
  if (!dragId || !newStatus) { return; }
  if (dragEl?.dataset.status !== newStatus) { vscode.postMessage({ type:'moveCard', id:dragId, status:newStatus }); }
}
function onCardDragOver(e) {
  e.preventDefault(); e.stopPropagation();
  const target = e.currentTarget;
  if (!dragEl || target === dragEl) { return; }
  if (target.closest('.col')?.dataset.col !== dragSourceCol) { return; }
  document.querySelectorAll('.card.drop-above,.card.drop-below').forEach(c=>c.classList.remove('drop-above','drop-below'));
  const rect = target.getBoundingClientRect();
  target.classList.add(e.clientY < rect.top + rect.height/2 ? 'drop-above' : 'drop-below');
}
function onCardDrop(e) {
  e.preventDefault(); e.stopPropagation();
  const target = e.currentTarget;
  if (!dragEl || target === dragEl) { return; }
  if (target.closest('.col')?.dataset.col !== dragSourceCol) { return; }
  const rect = target.getBoundingClientRect();
  vscode.postMessage({ type:'reorderCard', id:dragId, targetId:target.dataset.id, before: e.clientY < rect.top + rect.height/2 });
}
</script>
</body>
</html>`;
}

// ── HTML content builder (returns inner HTML string only) ─────────────────────

export function getBoardContent(
	prd: Prd | null,
	memories: string | null,
	logs: Record<string, TaskLog>,
	cfg: BoardConfig
): string {
	if (!prd) { return emptyState(); }
	const bar = statsBar(prd, cfg);
	if (cfg.view === 'history') { return bar + historyView(logs); }
	if (cfg.view === 'epic')    { return bar + epicView(prd, logs); }
	return bar + boardView(prd, logs, cfg.autoRun) + guardrailsPanel(cfg.guardrails, cfg.boundaries) + (memories ? memoriesPanel(memories) : '');
}


// ── Helpers ───────────────────────────────────────────────────────────────────

export function esc(s: unknown): string {
	return String(s ?? '')
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;')
		.replace(/'/g,'&#39;');
}

export function escJsArg(s: unknown): string {
	return esc(JSON.stringify(String(s ?? '')));
}

export function escAttr(s: unknown): string {
	return esc(String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ''));
}

const PRIORITY_DOT: Record<string, string> = { P0:'#f85149', P1:'#e3b341', P2:'#58a6ff', P3:'#6e7681' };
const PRIORITY_LABEL: Record<string, string> = { P0:'Critical', P1:'High', P2:'Medium', P3:'Low' };

function card(issue: Issue, log: TaskLog | null): string {
	const pc = PRIORITY_DOT[issue.priority] ?? '#6e7681';
	const pl = PRIORITY_LABEL[issue.priority] ?? issue.priority;
	const deps = issue.dependencies?.length ? `<div class="card-deps">⛓ ${esc(issue.dependencies.join(', '))}</div>` : '';
	const epic = issue.epic ? `<span class="card-epic">${esc(issue.epic)}</span>` : '';
	const labels = (issue.labels ?? []).map(l => `<span class="card-label">${esc(l)}</span>`).join('');
	const idAttr = escAttr(issue.id);
	const statusAttr = escAttr(issue.status);
	const idJs = escJsArg(issue.id);

	let logBadge = '';
	if (log?.status === 'completed' && log.durationMin !== undefined) {
		logBadge = `<span class="log-badge log-done">✓ ${log.durationMin}m</span>`;
	} else if (log?.status === 'inprogress') {
		logBadge = `<span class="log-badge log-running log-waiting">⏱ waiting…</span>`;
	}

	const noteText = log?.note || log?.summary || '';
	const noteHtml = noteText ? `<div class="card-summary">${esc(noteText.slice(0,140))}${noteText.length>140?'…':''}</div>` : '';

	const criteriaCount = issue.acceptanceCriteria?.length ?? 0;
	const criteriaTooltip = criteriaCount > 0 ? issue.acceptanceCriteria.map((ac,i) => `${i+1}. ${ac}`).join('\n') : '';

	let actions = '';
	if (issue.status === 'todo')        { actions = `<button class="btn btn-run" onclick="send(&quot;runTask&quot;,${idJs})">▶ Run</button>`; }
	else if (issue.status === 'blocked'){ actions = `<button class="btn btn-disabled" disabled>⛓ Blocked</button>`; }
	else if (issue.status === 'inprogress') { actions = `<button class="btn btn-run" onclick="send(&quot;contextRefresh&quot;,${idJs})" title="Send context recovery prompt to chat">🔄 Refresh</button><button class="btn btn-done" onclick="send(&quot;markDone&quot;,${idJs})">✓ Mark done</button>`; }
	else { actions = `<button class="btn btn-note" onclick="send(&quot;addNote&quot;,${idJs})" title="Add note">✎</button><button class="btn btn-reset" onclick="send(&quot;resetTask&quot;,${idJs})">↩ Reset</button>`; }

	return `<div class="card" draggable="true" data-id="${idAttr}" data-status="${statusAttr}"
     ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"
     ondragover="onCardDragOver(event)" ondrop="onCardDrop(event)">
  <div class="card-header">
    <div class="card-header-left"><span class="card-id">${esc(issue.id)}</span>${epic}${labels}</div>
    <div class="card-header-right"><span class="priority-dot" style="background:${pc}" title="${pl}"></span>${logBadge}</div>
  </div>
  <div class="card-title" onclick="send(&quot;showEditIssue&quot;,${idJs})" title="Click to edit">${esc(issue.title)}</div>
  ${issue.description ? `<div class="card-desc">${esc(issue.description.slice(0,100))}${issue.description.length>100?'…':''}</div>` : ''}
  ${noteHtml}${deps}
  <div class="card-footer">
    <span class="card-criteria${criteriaTooltip?' has-tooltip':''}"${criteriaTooltip?` data-tooltip="${esc(criteriaTooltip)}"`:''}>
      ${criteriaCount} criteria${criteriaCount>0?' 👁':''}
    </span>
    ${actions}
  </div>
</div>`;
}

function boardView(prd: Prd, logs: Record<string, TaskLog>, autoRun: boolean): string {
	const cols = [
		{ key:'todo',       label:'To Do',       color:'#58a6ff' },
		{ key:'inprogress', label:'In Progress',  color:'#e3b341' },
		{ key:'completed',  label:'Done',         color:'#3fb950' },
		{ key:'blocked',    label:'Blocked',      color:'#f85149' },
	];
	return `<div class="board">${cols.map(col => {
		const issues = prd.issues.filter(i => i.status === col.key);
		const cards  = issues.map(i => card(i, logs[i.id] ?? null)).join('');
		return `<div class="col" data-col="${col.key}"
      ondragover="onDragOver(event)" ondragenter="onDragEnter(event)"
      ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
  <div class="col-header">
    <span class="col-title" style="color:${col.color}">${col.label}</span>
    <span class="col-count">${issues.length}</span>
  </div>
  <div class="col-body">${cards || '<div style="color:var(--text2);font-size:11px;text-align:center;padding:20px 0">Drop here</div>'}</div>
</div>`;
	}).join('')}</div>`;
}

function epicView(prd: Prd, logs: Record<string, TaskLog>): string {
	const epics = [...new Set(prd.issues.map(i => i.epic || 'General'))];
	return epics.map(epic => {
		const issues = prd.issues.filter(i => (i.epic || 'General') === epic);
		const done   = issues.filter(i => i.status === 'completed').length;
		return `<div class="epic-group">
  <div class="epic-group-header">
    <span class="epic-group-title">${esc(epic)}</span>
    <span class="epic-progress">${done}/${issues.length}</span>
  </div>
  <div class="epic-cards">${issues.map(i => card(i, logs[i.id]??null)).join('')}</div>
</div>`;
	}).join('');
}

function historyView(logs: Record<string, TaskLog>): string {
	const items = Object.values(logs).filter(l => l.completedAt).sort((a,b) => (b.completedAt??'').localeCompare(a.completedAt??''));
	if (!items.length) { return '<div style="padding:20px;color:var(--text2);text-align:center">No completed tasks yet</div>'; }
	return `<div style="padding:10px;overflow-x:auto"><table class="history-table">
<thead><tr><th>ID</th><th>Title</th><th>Duration</th><th>Date</th><th>Note</th></tr></thead>
<tbody>${items.map(l => `<tr>
  <td><span class="card-id">${esc(l.id)}</span></td>
  <td>${esc(l.title||l.id)}</td>
  <td><span class="dur-badge">${l.durationMin??'?'}m</span></td>
  <td style="color:var(--text2);font-size:11px">${(l.completedAt??'').slice(0,10)}</td>
  <td style="color:var(--text2);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(l.note||l.summary||'')}</td>
</tr>`).join('')}</tbody></table></div>`;
}

function statsBar(prd: Prd, cfg: BoardConfig): string {
	const stats   = { total: prd.issues.length, completed: prd.issues.filter(i=>i.status==='completed').length };
	const pct     = stats.total ? Math.round((stats.completed/stats.total)*100) : 0;
	const epics   = [...new Set(prd.issues.map(i=>i.epic).filter(Boolean))];
	const views   = [['board','⊞ Board'],['epic','⬡ Epic'],['history','📋 History']] as const;
	const viewBtns = views.map(([v,l]) => `<button class="btn btn-sm ${cfg.view===v?'btn-view-active':''}" onclick="send('setView','${v}')">${l}</button>`).join('');
	const runnerBtn = cfg.autoRun
		? `<button class="btn btn-sm btn-runner-on" onclick="send('stopRunner')">⏹ Stop</button>`
		: `<button class="btn btn-sm btn-runner-off" onclick="send('startRunner')">⚡ Auto-run</button>`;

	return `<div class="stats-bar">
  <div class="stats-top">
    <span class="project-title">${esc(prd.project)}</span>
    <span class="project-desc">${esc(prd.description||'')}</span>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <span class="progress-pct">${stats.completed}/${stats.total} ${pct}%</span>
  </div>
  <div class="epics-row">${epics.map(e=>`<span class="epic-chip">${esc(e!)}</span>`).join('')}</div>
  <div class="stats-actions">
    <div class="view-switcher">${viewBtns}</div>
    ${runnerBtn}
    <button class="btn btn-sm btn-github" onclick="send('pushToGitHub')" title="Push to GitHub">⬆ GitHub</button>
    <button class="btn btn-sm btn-github" onclick="send('syncFromGitHub')" title="Sync from GitHub">⬇ Sync</button>
    <button class="btn btn-sm btn-add" onclick="send('showAddIssue')" title="Add new issue">＋ Issue</button>
    <button class="btn btn-sm btn-add" onclick="send('addFromChat')" title="Add via Chat">＋ Chat</button>
    <button class="btn btn-sm" onclick="send('openPrd')" title="Edit prd.json">📄 PRD</button>
    <button class="btn btn-sm" onclick="send('openMemories')">🧠 Memory</button>
    <button class="btn btn-sm btn-optimize" onclick="send('optimizeMemory')" title="Optimize memories.md — compress and remove duplicates">🧹 Optimize</button>
    <button class="btn btn-sm" onclick="send('importPlan')" title="Import or append from Plan">⬇ Plan</button>
    <button class="btn btn-sm btn-setup" onclick="send('setupProject')" title="Generate AGENTS.md and plans/">⚙ Agents</button>
    <button class="btn btn-sm" onclick="send('openSettings')">⚙</button>
    <button class="btn btn-sm" onclick="send('refresh')">↻</button>
  </div>
</div>`;
}

function guardrailsPanel(guardrails: string[], boundaries: string[]): string {
	if (!guardrails.length && !boundaries.length) { return ''; }
	return `<details class="guardrails-panel">
  <summary>🛡 Guardrails & Boundaries</summary>
  <div class="guardrails-body">
    ${guardrails.length ? `<div class="guardrails-section"><div class="guardrails-label">Rules</div>${guardrails.map(g=>`<div class="guardrail-item">• ${esc(g)}</div>`).join('')}</div>` : ''}
    ${boundaries.length ? `<div class="guardrails-section"><div class="guardrails-label">Never touch</div>${boundaries.map(b=>`<div class="guardrail-item boundary-item">🚫 ${esc(b)}</div>`).join('')}</div>` : ''}
    <button class="btn btn-sm" onclick="send('openSettings')" style="margin-top:6px">Edit in settings</button>
  </div>
</details>`;
}

function memoriesPanel(memories: string): string {
	return `<details class="memories-panel">
  <summary>🧠 Project Memory <span class="mem-hint">(edit in .agent/memories.md)</span></summary>
  <pre class="memories-content">${esc(memories)}</pre>
</details>`;
}

function emptyState(): string {
	return `<div class="empty-state">
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
