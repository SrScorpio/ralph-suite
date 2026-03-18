# Changelog

## [0.1.0] - 2026-03-18

### Added
- Kanban board with 4 columns: To Do, In Progress, Done, Blocked
- Dual schema support: `userStories` (ralph-runner) and `issues` formats
- Numeric and string priority normalization (1-26 → P0-P3)
- Auto-refresh via file watchers on `.ralph/task-*-status`
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
- Webview disposed fix on panel reopen

## [1.0.0] - 2026-03-18

### Added
- History view (📋) — table of all completed tasks with duration, date, and note
- Epic view (⬡) — tasks grouped by epic with per-epic progress bars
- View switcher in stats bar: Board / Epic / History
- Import Plan (⬇ Plan) — parses Plan agent markdown → prd.json automatically
  - Detects steps, acceptance criteria, verification section
  - Auto-assigns epics via keyword detection
  - Sequential dependencies between steps
  - Works with active markdown editor or file picker
- Auto-captured NOTA: from agent response → log.json note field
- ✎ Note button on Done cards for manual note entry
- Guardrails and boundaries injected into every task prompt
- GitHub push/sync via MCP prompts

### Fixed
- Webview disposed error on panel reopen
- Priority normalization for numeric values (1-26 → P0-P3)
