# Changelog

All notable changes to Ralph Suite are documented here.

---

## [Unreleased]

### Changed
- **Upgrade de engine de VS Code** — `engines.vscode` subido de `^1.90.0` a `^1.103.0` (julio 2025) para alinear con versiones recientes
- **`@types/vscode`** actualizado a `^1.103.0`

### Security
- **Content Security Policy en el webview** — añadida CSP estricta en `getShellHtml()` que restringe recursos externos (`default-src 'none'`, límites en `img-src`/`font-src`). Mantiene `'unsafe-inline'` para scripts/estilos temporalmente mientras se completa el refactor de handlers inline documentado en `plans/seguridad.md`.

---

## [1.7.0] - 2026-06-05

### Added
- **MIT License** (`LICENSE.md`) y metadatos del repositorio

### Changed
- **Modularización completa del código** — `extension.ts` dividido en módulos independientes:
  - `src/activate.ts` — lógica de activación
  - `src/kanbanPanel.ts` — panel Kanban y manejador de mensajes
  - `src/prdManager.ts` — acceso al PRD con escritura atómica
  - `src/stateManager.ts` — gestión de estado y señalización
  - `src/promptBuilders.ts` — construcción de prompts para el chat
  - `src/agentsMdBuilders.ts` — generación de AGENTS.md
  - `src/commands/` — comandos separados: `memory.ts`, `menu.ts`, `project.ts`, `task.ts`
  - `src/kanban/` — sub-módulos: `contextRefresh.ts`, `gitHubSync.ts`, `planImport.ts`
- `src/extension.ts` reescrito como orquestador ligero
- Actualizados planes de arquitectura, decisiones y seguridad

### Fixed
- Ignorados artefactos generados (VSIX, compiled) via `.gitignore` y `.vscodeignore`

---

## [1.6.9] - 2026-06-05

### Changed
- Actualizadas dependencias (`@types/node`)
- Excluidos archivos del empaquetado VS Code (`.vscodeignore`)

### Fixed
- Ignorados artefactos compilados (VSIX) del repositorio

---

## [1.6.8] - 2026-06-05

### Added
- **PrdManager** — acceso centralizado raw al PRD con escritura atómica y `prdPath` configurable
- **Perfiles de agente** — propiedades configurables: `agentRole`, `agentStack`, `agentProject`, `agentCheckpoints`
- **Sanitización mejorada** de entradas de usuario en todas las rutas
- Tests: `contextInjector.test.ts`, `contextRefresh.test.ts`, `sanitization.test.ts`, mocks de VS Code

### Changed
- **ISSUE-002: Context injection inteligente** — `contextInjector.ts` con inyección por secciones (ADR-002): Core+Conventions siempre inyectados, Decisions solo cuando la tarea depende de ellas, Task History nunca auto-inyectado
- **ISSUE-001: Context Refresh mid-task** — refresco de contexto para tareas en progreso
- Actualizados `tsconfig.json` (tipos estrictos) y `package.json`

---

## [1.6.5] - 2026-03-22

### Added
- **Traducciones al español** — `package.nls.es.json` para localización de la extensión
- Mejorado manejo de estado en KanbanPanel

### Changed
- Actualizados AGENTS.md, `.github/copilot-instructions.md`, `plans/` y documentación del proyecto

---

## [1.6.3] - 2026-03-20

### Fixed
- **Critical: webview communication broken after first re-render** — `acquireVsCodeApi()` was being called on every `render()` call (which replaces the full HTML), causing it to fail silently on the second call and leaving `send()` undefined. All button clicks in the board were silently dropped. Fixed by splitting the webview into a shell (loaded once) and a data layer (updated via `postMessage`). This is the correct VSCode webview architecture.

---

## [1.6.2] - 2026-03-20

### Fixed
- Added nonce to each render to prevent VSCode from caching stale HTML
- Added guard for `acquireVsCodeApi()` to prevent multiple calls on re-render (partial fix, superseded by 1.6.3)

---

## [1.6.1] - 2026-03-20

### Fixed
- Compiled dist was not being cleaned before packaging — vsix contained stale code from previous version despite package.json showing correct version number
- Version string now read from package.json at build time

---

## [1.6.0] - 2026-03-20

### Fixed
- Removed `workbench.action.focusFirstEditorGroup` calls before `initProject` and `importPlan` — these were stealing focus from the webview and causing the message handler to enter an inconsistent state, silently dropping all subsequent button clicks
- Removed broken async message queue introduced in 1.5.5 — the queue had a re-entrancy bug where `handlerBusy` was never reset correctly under concurrent async calls, causing the queue to deadlock permanently

---

## [1.5.9] - 2026-03-20

### Fixed
- Replaced broken message queue with direct async handler — each message fires independently without blocking subsequent messages

---

## [1.5.8] - 2026-03-20

### Added
- Detailed logging to `initProject` and `importPlan` board handlers to trace message flow

---

## [1.5.7] - 2026-03-20

### Changed
- Rewrote `extension.ts` clean from scratch to eliminate accumulated patch layers
- `output.show()` called on activation so Output channel appears automatically
- `setupProject` no longer exported as public function (was confusing VSCode runtime)

### Fixed
- `activationEvents` cleaned up — removed redundant `onCommand:` entries (auto-generated by VSCode from `contributes.commands`)

---

## [1.5.6] - 2026-03-20

### Fixed
- `activationEvents` updated to include explicit `onCommand:` entries for key commands to improve activation reliability across platforms

---

## [1.5.5] - 2026-03-20

### Fixed
- `normalizeItem` in `prdManager.ts` was always setting `status: 'todo'` regardless of the value in `prd.json` — completed tasks were reappearing as todo on every board reload
- `setInProgress` now accepts and preserves task title in log.json
- Task title passed correctly to `setInProgress` from all call sites
- Focus fix for `importPlan` and `initProject` when triggered from board (removed, later reverted as harmful)

### Added
- Async message queue in `onDidReceiveMessage` to prevent race conditions (later found to be the cause of the deadlock bug fixed in 1.6.0)

---

## [1.5.4] - 2026-03-20

### Fixed
- File watcher now uses `RelativePattern` with exact workspace path instead of glob `**/prd.json` for reliability on macOS
- Polling added after Init Project chat opens — detects prd.json creation and notifies user with "Open Board" button

---

## [1.5.3] - 2026-03-20

### Added
- `activate()` wrapped in try/catch to surface activation errors in Output channel
- `_activate()` extracted as inner function for clean error boundary

---

## [1.5.2] - 2026-03-20

### Fixed
- `initProject` now has two-stage fallback: primary `chat.open` with query, then open chat first and retry, then clipboard copy
- All chat open attempts logged to Output channel

---

## [1.5.1] - 2026-03-20

### Fixed
- `showAddIssue` from quick menu now correctly posts `openAddModal` back to webview JS (previously the TypeScript handler was a no-op)
- `window.addEventListener('message')` added to webview to receive messages from extension
- Duplicate keydown handler removed

### Added
- **Edit Issue modal** — click any card title to open a full edit form: title, description, epic, priority, acceptance criteria, labels, dependencies. Saves directly to `prd.json`
- `showEditIssue` / `editIssue` message handlers in kanbanPanel
- `normalizeStatus()` function in prdManager to correctly parse status from prd.json
- **NOTA: note deduplication fix** — parser now finds `NOTA:` line anywhere in the signal file (agents sometimes write extra text before it), stripping the prefix cleanly from both `log.json` and `memories.md`

---

## [1.5.0] - 2026-03-20

### Added
- **Init Project via AI chat** — replaces blank template generation. Sends a structured prompt to Copilot/Claude that asks clarifying questions and generates all 6 project files in one session: `AGENTS.md`, `.github/copilot-instructions.md`, `plans/arquitectura.md`, `plans/seguridad.md`, `plans/decisiones.md`, `prd.json`. Files reflect real project decisions, not generic templates.
- Guardrails defaults expanded to 14 rules covering task states, secrets, testing, security checkpoints, code conventions, and blocked task signaling
- `PLANS.md` session scratchpad decision: deliberately NOT added — redundant with `memories.md` + `plans/`

### Changed
- `buildInitPrompt` completely rewritten to drive a full project setup conversation

---

## [1.4.0] - 2026-03-20

### Added
- **⚙ Agents button** in board stats bar and quick menu — generates/regenerates `AGENTS.md` and `plans/` from Settings config
- **Setup Project command** (`ralph-suite.setupProject`) — creates 5 files: `AGENTS.md`, `.github/copilot-instructions.md`, `plans/arquitectura.md`, `plans/seguridad.md`, `plans/decisiones.md`
- New Settings properties: `agentRole`, `agentStack`, `agentProject`, `agentCheckpoints`
- `plans/` files never overwritten if they already exist (user edits are safe)
- If `AGENTS.md` exists, offers: Regenerate / Open to edit / Cancel
- If `agentStack` or `agentProject` are empty, warns and offers to open Settings first
- `setupProject` wired to board message handler and quick menu

### Architecture decision
- `plans/estado.md` and `plans/requisitos.md` NOT created — redundant with `memories.md` (state) and `prd.json` (requirements)
- Final structure: `AGENTS.md`, `.github/copilot-instructions.md`, `plans/arquitectura.md`, `plans/seguridad.md`, `plans/decisiones.md`

---

## [1.3.0] - 2026-03-20

### Added
- **Quick menu** — clicking the `$(layout-panel) Ralph` status bar item opens a QuickPick with all actions: Open Board, Auto-run, Stop runner, Run next task, Add Issue, Open PRD, Memories, Setup Project, Settings. Shows project name and progress % when prd.json exists.
- **`ralph-suite.showMenu`** command registered and bound to status bar
- **`ralph-suite.startRunner`** and **`ralph-suite.stopRunner`** commands for external access
- **Task timeout + retry system** — `runTaskWithRetry()` function polls for completion signal, retries on timeout, marks task as `failed` after all retries exhausted
- New Settings: `taskTimeoutMs` (default 10 min), `taskRetries` (default 1), `minWaitMs` (default 15s), `pollIntervalMs` (default 5s)
- **`ralph-suite.setupProject`** command registered (placeholder for 1.4.0 implementation)
- Board actions from quick menu (Add Issue, Open PRD, Memories) open the board first then send the action via `KanbanPanel.sendMessage()`

---

## [1.2.0] - 2026-03-20

### Added
- **Fresh Context** (`ralph-suite.freshContext`, default: `true`) — opens a new chat window per task via `workbench.action.chat.newChat` before sending the prompt. Prevents context bleeding between tasks.
- **Acceptance criteria tooltip** — card footer shows "N criteria 👁". Hover shows all criteria in a CSS tooltip without opening prd.json.
- **Waiting indicator** — In Progress cards show "⏱ waiting…" with a CSS pulse animation instead of static "⏱ running"
- **Same-column drag reorder** — cards can be dragged up/down within the same column. Drop indicator (blue line) shows insertion point. Order is persisted to `prd.json`.
- `onCardDragOver` / `onCardDrop` handlers in webview JS
- `reorderCard` message handler in kanbanPanel — updates `prd.json` issue order

---

## [1.1.1] - 2026-03-20

### Fixed
- `.ralph/` leftover state warning added to `initProject` — detects status files from previous projects and offers to clear them
- `.ralph/` leftover state warning added to `importPlan` (fresh import only, not append mode)

---

## [1.1.0] - 2026-03-20

### Added
- **＋ Issue button** — modal form in the board: title, description, epic, priority, acceptance criteria (one per line), labels. Writes directly to `prd.json`. Auto-generates ID matching existing format (US-NNN, ISSUE-NNN, etc.). `Ctrl+Enter` to confirm, `Escape` to cancel.
- **＋ Chat button** — sends a structured prompt to Copilot Chat describing the prd.json schema and asking to add issues in natural language
- **Import Plan — Append mode** — when `prd.json` already exists, Import Plan now offers: Append / Overwrite / Cancel. Append re-IDs imported issues to avoid conflicts.
- `generateNextId()` — detects existing ID format and generates next sequential ID
- `buildAddFromChatPrompt()` — builds the "add issues via chat" prompt with project context

---

## [1.0.0] - 2026-03-18

### Added
- History view (📋) — table of all completed tasks with duration, date, and note
- Epic view (⬡) — tasks grouped by epic with per-epic progress bars
- View switcher in stats bar: Board / Epic / History
- Import Plan (⬇ Plan) — parses Plan agent markdown → prd.json
  - Detects steps, acceptance criteria, verification section
  - Auto-assigns epics via keyword detection
  - Sequential dependencies between steps
  - Works with active markdown editor or file picker

### Fixed
- Webview disposed error on panel reopen (clear `KanbanPanel.current` before `disposed = true`)
- Priority normalization for numeric values (1-26 → P0-P3)

---

## [0.1.0] - 2026-03-18

### Added
- Kanban board webview with 4 columns: To Do, In Progress, Done, Blocked
- Dual schema support: `userStories[]` (ralph-runner) and `issues[]` formats
- Numeric and string priority normalization
- Auto-refresh via file watchers on `.ralph/task-*-status` and `.ralph/task-*-note`
- Drag-and-drop between columns
- Autonomous runner (⚡ Auto-run) with configurable max loops
- Dependency-based auto-blocking between tasks
- Persistent task logs in `.ralph/task-*-log.json`
- Auto-captured agent notes via `NOTA:` signal line → log.json + memories.md
- Manual ✎ Note button on Done cards
- Project memory system in `.agent/memories.md`
- Guardrails and boundaries injected into every task prompt
- Push to GitHub Issues via MCP prompt (⬆ GitHub)
- Sync GitHub Issue status back to local board (⬇ Sync)
- Init Project command to generate prd.json via AI chat
- `.gitignore` auto-updated to exclude `.ralph/` runtime state
