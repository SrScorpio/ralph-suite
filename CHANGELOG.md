# Changelog

All notable changes to Ralph Suite are documented here.

---

## [Unreleased]

### Added
- IDs nuevos de backlog en formato `ISSUE-NNN` (mínimo 3 letras + número). Analyze, Init, import de plan, addIssue y Add from Chat ya no generan `1` ni `STEP-*`. IDs legacy se conservan.

### Changed

### Fixed

## [1.11.2] - 2026-09-20

### Changed
- Kanban carga PRDs de Analyze con `tasks`, `projectName`, ids numéricos, `planned`, `acceptance` y `phase`.
- El board registra `Board loaded N issues`.

### Fixed
- El estado vacío se muestra cuando hay 0 issues.

## [1.11.1] - 2026-09-20

### Fixed
- Open Board / Init funcionan sin `prd.json`: usan `folders[0]` como fallback. El mensaje "No workspace open" solo aparece cuando no existen `workspaceFolders`.

## [1.11.0] - 2026-09-19

### Added
- `ralph-suite.syncIssue` as a public, trust-gated command for syncing one GitHub issue status to the matching local Ralph task. It accepts issue numbers `1..999999`, statuses `todo`, `inprogress`, `blocked` and `completed`, and an optional allowlisted workspace root.
- Explicit label mapping for `github:#N` and `owner/repo#N`. The command never infers a GitHub number from a local ID such as `ISSUE-012`.
- Multi-folder watchers and the `Analyze Existing Project` / `Start New Project` flows, together with the Windows-safe `scripts/run-tests.js` runner and abort/timeout/listener cleanup in `sendToChat`.

### Changed
- Issue sync writes only `.ralph/task-<local-id>-status`; it does not modify `prd.json`.
- ADR-016 keeps parallel dispatch out of Alfred: no N× `runTask` calls are launched. A future scheduler, if needed, belongs to Ralph's runner.

### Verified
- QA and security gates approved; 133 tests pass.
- CI runs `npm test` and the extension packages successfully as a VSIX.

## [1.10.0] - 2026-09-18

### Added
- Public host-extension contract for Alfred Dev: documented command IDs (`openKanban`, `runTask`, `startRunner`, `stopRunner`). `ralph-suite.syncIssue` is still not contributed.
- Multi-root workspace root: commands prefer the folder that contains `prd.json` (honours `ralph-suite.prdPath`, no path traversal) instead of always using `workspaceFolders[0]`.
- Default project layout for Init / Setup: `AGENTS.md` at root, human docs under `docs/project/` and `docs/adr/`, machine backlog at `docs/ralph/prd.json`. Optional `docs/ralph/IMPLEMENTATION_PLAN.md` does not replace the PRD. Runtime stays in `.ralph/` (`progress.md` belongs there, never under `docs/`).

### Changed
- README documents the optional relationship with Alfred Dev (`SrScorpio/alfred-dev-vscode`): GitHub Issues remain Alfred's source of truth; `prd.json` remains Ralph's local backlog.
- Default `ralph-suite.prdPath` is `docs/ralph/prd.json`. If that file is missing and a root `prd.json` exists, Ralph keeps using the legacy root file (no copy/merge of two backlogs). Custom `prdPath` is still honoured and cannot escape the workspace.
- Setup Project command title, Kanban copy and generated `AGENTS.md` read list now point at `docs/`, not `plans/` as the primary convention.
- Distribution is GitHub Releases only (VSIX + source from the tag). There is no Marketplace listing.

## [1.9.1] - 2026-08-07

### Fixed
- **Bug crítico en `detectLocale()`** — `i18n.ts` usaba `declare const vscode` en vez de `import * as vscode`, así que en runtime la variable era `undefined` y la detección de idioma siempre devolvía `'en'` aunque VS Code estuviera en español. Ahora importa `vscode` correctamente y lee `vscode.env.language`.
- **Traducción incompleta** — en la v1.9.0 solo se tradujeron columnas, empty state e history view. Ahora la traducción es completa: botones de la stats bar, acciones de tarjetas, modales Add/Edit Issue, tooltip del health score, labels de épicas y headers de la tabla de historial.

### Changed
- `getShellHtml(nonce, locale)` ahora recibe el locale y traduce los modales estáticos del shell HTML.
- Mock de VS Code (`vscodeMock.ts/.js`) ampliado con `env.language` y `env.locale` para soportar tests de i18n.

---

## [1.9.0] - 2026-08-04

### Added
- **Health score (ADR-005)** — métrica de salud del proyecto (0-100) calculada desde `.ralph/task-*-log.json`, mostrada como badge con tooltip de desglose (completion, success rate, throughput, blocker penalty). Visible en la barra de stats del board.
- **Dependency graph visual (ADR-006)** — render SVG de dependencias en la vista Epic. Muestra flechas entre tareas dependientes, con código de color: verde (satisfecha), rojo (bloqueante), y tareas bloqueadas con borde ámbar.
- **Infraestructura i18n (`src/i18n.ts`)** — catálogo de traducciones para el webview. Detecta el idioma de VS Code (`vscode.env.language`) y traduce columnas, empty state, history view. Soporta **en** y **es**; añadir más idiomas es copiar un bloque.
- **Tests para `chatLauncher` (5)** y **`planImport` (13)** — cobertura nueva para los módulos críticos sin test.
- **Dependencias secuenciales en planImport** — los pasos importados de un Plan markdown ahora se encadenan automáticamente (STEP-N depende de STEP-(N-1)), como prometía el README.

### Changed
- **Refactor `kanbanPanel.ts`** — extraídos los sanitizadores (`safeMessageId`, `isBoardStatus`, `cleanText`, `cleanPriority`, `cleanIssueFields`, `getNonce`) a `src/boardSanitizers.ts`. Reduce el tamaño del panel y permite testearlos de forma aislada.
- **Mock de VS Code unificado (singleton)** — `vscodeMock.ts` ahora devuelve siempre el mismo objeto, permitiendo a los tests espiar/mutar `vscode.commands.executeCommand` y observar el cambio en módulos que capturaron su referencia al importarse.
- **Warning de ES modules eliminado** — `NODE_NO_WARNINGS=1` en el script de test.
- **`Issue`/`Prd`/`TaskLog` sin duplicar** — `kanbanHtml.ts` ahora importa los tipos de `prdManager`/`stateManager` en vez de redeclararlos.
- **README actualizado** — versión 1.9.0, tabla de configuración completa (incluye `engine`, `modelProfiles`, `prdPath`, `memoriesPath`, `memoryOptimizeEvery`, `memoryOptimizeReview`), sección de prerrequisitos.

### Removed
- **`escJsArg`** eliminado — era un helper para escapar argumentos JS de handlers inline (`onclick`), pero esos handlers se eliminaron en v1.8.0 con el event delegation. No quedaba ningún caller de producción.
- **Exports innecesarios** — `AgentProfile`, `inferTaskType`, `resolveAgentProfile`, `loadMemory`, `ChatOptions`, `ImportedPrd` dejaron de ser `export` (solo se usaban internamente).

---

## [1.8.1] - 2026-08-02

### Documented
- **ADR-015** registrado en `plans/decisiones.md`: documenta formalmente la auditoría de settings de la v1.8.0, incluyendo investigación del historial de git, análisis de intención original de `autoRun` y `memoryOptimizeAutoApply`, decisión y consecuencias (riesgo para usuarios con esos settings en `settings.json`).
- **CHANGELOG ampliado**: las entradas *Removed* de v1.8.0 ahora explican el *porqué* (investigación de historial, no solo el *qué* estático).

---

## [1.8.0] - 2026-08-02

### Changed
- **Upgrade de engine de VS Code** — `engines.vscode` subido de `^1.90.0` a `^1.103.0` (julio 2025) para alinear con versiones recientes
- **`@types/vscode`** actualizado a `^1.103.0`
- **`LogOutputChannel`** — migrado `createOutputChannel` a `{ log: true }` para logging estructurado con niveles y marcas de tiempo
- **`chatLauncher.ts`** — nuevo módulo centralizado para invocar el Chat de VS Code. Centraliza el patrón `newChat + open + clipboard fallback` que estaba duplicado en 8 sitios (`task.ts`, `memory.ts`, `project.ts`, `kanbanPanel.ts`). Si el comando interno cambia en el futuro, solo se actualiza un archivo
- **`memoriesPath` conectado** — la ruta `.agent/memories.md` estaba hardcodeada en 4 archivos; ahora se lee del setting `ralph-suite.memoriesPath` en todos los sitios (`memory.ts`, `project.ts`, `contextInjector.ts`, `kanbanPanel.ts`, `promptBuilders.ts`), con protección anti path traversal y fallback al valor por defecto
- **NLS corregido** — la descripción de `engine` omitía `codex` en EN y ES; ahora lista los 4 motores correctamente

### Removed
- **`ralph-suite.autoRun`** (setting eliminado) — presente desde el primer commit (v0.1.0), declarado en `package.json` pero **nunca cableado al código** (verificado con `git log -G` sobre toda la historia). Su descripción ("auto-start next task when current completes") duplicaba la funcionalidad del runner, que ya encadena tareas automáticamente al pulsar ⚡ Start. El estado del runner se controla con el campo de instancia `this.autoRun` (seteado por los botones del board), no desde config. Decisión: eliminar el setting muerto y mantener el comportamiento del runner controlado por UI (ver ADR-015).
- **`ralph-suite.memoryOptimizeAutoApply`** (setting eliminado) — descrito como inverso lógico de `memoryOptimizeReview` (`autoApply=true` ≡ `review=false`) y nunca cableado. Su intención probable era distinguir el comportamiento del comando manual vs el auto-trigger (`memoryOptimizeEvery`), pero ambos caminos terminan llamando al comando `ralph-suite.optimizeMemory`, que ya lee `memoryOptimizeReview`. Decisión: consolidar en un único setting `memoryOptimizeReview` aplicable a ambos casos (manual y auto-trigger), evitando la dualidad confusa (ver ADR-015).

### Security
- **CSP estricta con nonce** en el webview (`getShellHtml(nonce)`) — `script-src 'nonce-<nonce>'` (sin `'unsafe-inline'`), restringe recursos externos (`default-src 'none'`), `style-src 'unsafe-inline'` temporalmente
- **Eliminados los 31 handlers inline** del webview (`onclick`, `ondragstart`, `ondragover`, `ondrop`, etc.) — sustituidos por **event delegation** mediante atributos `data-action` / `data-id` / `data-close` y listeners `addEventListener` en `document`
- **Drag & Drop refactorizado** a delegación de eventos con `closest()` — ya no requiere re-binding tras cada `innerHTML`
- **Nonce generator** añadido en `kanbanPanel.ts` (`getNonce()`) e inyectado en CSP y etiqueta `<script>`

### Verified
- Compilación TypeScript sin errores
- 51 tests unitarios pasando (sanitización, PRD, memoria, context refresh)
- Empaquetado `vsce package` correcto (VSIX 69 KB, 26 archivos)

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
