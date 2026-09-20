# Ralph Suite — VSCode Extension

Autonomous AI task runner with Kanban board, project memory and multi-engine support.  
Inspired by the [RALPH Wiggum technique](https://github.com/badlogic/lemmy/issues/2). Designed for VSCode without CLI dependencies.

---

## Install (GitHub Releases, no Marketplace)

Ralph Suite is **not** on the Visual Studio Marketplace. Install the VSIX from [GitHub Releases](https://github.com/SrScorpio/ralph-suite/releases). The published asset is `ralph-suite-1.11.2.vsix`.

1. Open the latest [GitHub Release](https://github.com/SrScorpio/ralph-suite/releases)
2. Download `ralph-suite-1.11.2.vsix`
3. VS Code → Extensions → ⋯ → **Install from VSIX…** → select the file

To build from source instead:

```bash
# 1. Clone this repository
cd ralph-suite

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Package as .vsix
npm run package
# → creates ralph-suite-1.11.2.vsix

# 5. Install in VS Code
# Extensions panel → ⋯ → Install from VSIX → select the file
```

---

## Quick Start

1. Open a project folder in VSCode
2. Click the `$(layout-panel) Ralph` button in the status bar — or `Ctrl+Shift+R` / `Cmd+Shift+R`
3. If no `prd.json` exists → click **Init Project** → describe your project goal in Chat
4. The AI will ask clarifying questions and generate all project files in one session
5. Once `docs/ralph/prd.json` appears (or a legacy root `prd.json`), the board loads automatically
6. Click **▶ Run** on any issue to send it to the AI chat

---

## Project files

Ralph Suite creates and manages these files in your workspace:

```
AGENTS.md                   ← agent index at root
.github/
  copilot-instructions.md   ← auto-read by Copilot, references AGENTS.md
docs/
  project/
    architecture.md         ← architecture decisions and conventions
    threat-model.md         ← security rules, secrets, auth
    status.md               ← human snapshot (not the Kanban)
  adr/                      ← ADR log (why X was chosen over Y)
  ralph/
    prd.json                ← task backlog (committed to git)
    IMPLEMENTATION_PLAN.md  ← optional human plan; does not replace prd.json
.agent/
  memories.md               ← accumulated project knowledge (committed)
.ralph/                     ← runtime state — gitignored automatically
  task-ID-status            ← inprogress | completed
  task-ID-log.json          ← duration, note, timestamps
  task-ID-note              ← signal file from agent (consumed immediately)
  progress.md               ← loop scratch if written; never docs/progress.md
```

**Legacy fallback:** workspaces from 1.9.x with a root `prd.json` and no `docs/ralph/prd.json` keep using the root file. Ralph does not copy or merge two backlogs. A custom `ralph-suite.prdPath` is honoured (still no `..` escape). GitHub remains Alfred's collaborative source of truth; this layout only changes where the local backlog lives.

**This repository** still contains historical `plans/` (`arquitectura.md`, `seguridad.md`, `decisiones.md`). Those files are not deleted. **New user projects** created with Init / Setup get the `docs/` tree above, not `plans/`.

---

## prd.json schema

```json
{
  "project": "My Project",
  "description": "What this is about",
  "version": "1.0.0",
  "issues": [
    {
      "id": "ISSUE-001",
      "title": "Short title",
      "description": "What to implement",
      "epic": "Setup",
      "priority": "P0",
      "status": "todo",
      "acceptanceCriteria": ["criterion 1", "criterion 2"],
      "dependencies": [],
      "labels": ["setup"]
    }
  ]
}
```

**Priority:** `P0` (critical) → `P1` (high) → `P2` (medium) → `P3` (low)  
**Status:** managed automatically via `.ralph/` — do not edit manually  
**Dependencies:** array of issue IDs — blocked automatically until all deps are completed  
**Also supports** the `userStories[]` format from ralph-runner (numeric priorities auto-normalized)

---

## Board views

### Board (⊞)
Four columns with drag-and-drop between columns and reorder within columns:

| Column | Meaning |
|--------|---------|
| **To Do** | Pending, ready to run |
| **In Progress** | Currently being executed by the agent |
| **Done** | Completed — shows duration badge |
| **Blocked** | Waiting on unresolved dependencies (automatic) |

### Epic (⬡)
Tasks grouped by epic with per-epic progress bars.

### History (📋)
Table of all completed tasks with duration, completion date, and note.

---

## Stats bar buttons

| Button | Action |
|--------|--------|
| ⚡ Auto-run | Start autonomous task loop |
| ⏹ Stop | Stop the runner |
| ＋ Issue | Add a new issue via modal form |
| ＋ Chat | Add issues via natural language in Chat |
| 📄 PRD | Open prd.json in editor |
| 🧠 Memory | Open .agent/memories.md |
| ⬇ Plan | Import / append from Plan agent markdown |
| ⚙ Agents | Generate or regenerate AGENTS.md and docs/ |
| ⚙ | Settings |
| ↻ | Refresh board |

---

## Quick menu

Click the `$(layout-panel) Ralph` button in the status bar to open the quick menu with all actions. Shows project name and progress % when prd.json exists.

---

## Completion protocol

The agent must write two signal files when a task is done:

```
1. Write `completed` → .ralph/task-<ID>-status
2. Write `NOTA: <one line summary>` → .ralph/task-<ID>-note
```

Ralph Suite detects these files via watcher, updates the board, and appends the note to `.agent/memories.md` automatically.

---

## Memory system

`.agent/memories.md` is committed to git and injected into every task prompt. Use it for:

```markdown
# Project Memories

## Stack
- PHP 8.1, WordPress Plugin API
- Python 3.11 for scripts

## Conventions
- Use snake_case for PHP functions
- All API endpoints require nonce validation

## Known issues
- Legacy /old-api path is deprecated, use /v2

## [2026-03-20] ISSUE-001: Setup base structure
- **Duration:** 12 min
- **Note:** Created plugin skeleton with admin menu and REST endpoint stubs
```

Notes from completed tasks are appended automatically. Click **🧠 Memory** on the board to edit freely.

---

## AGENTS.md

Generated by **⚙ Agents** from your Settings config. Defines the agent's role, rules, checkpoints and completion protocol. Editable — regenerate anytime to apply Settings changes.

Configure in `Ctrl+,` → Ralph Suite:
- `ralph-suite.agentRole` — role description (e.g. "Senior WordPress Developer")
- `ralph-suite.agentStack` — tech stack comma-separated (e.g. "PHP 8.1, WordPress, MySQL")
- `ralph-suite.agentProject` — short project description
- `ralph-suite.agentCheckpoints` — actions requiring confirmation before execution

---

## Prerequisites

- VSCode 1.103+ (July 2025) or newer
- An AI chat provider installed and signed in: **GitHub Copilot**, **Claude**, **Codex**, or **OpenCode**
- Node.js 20+ (for development/packaging only)

---

## Configuration

`Ctrl+,` → search **ralph-suite**

| Setting | Default | Description |
|---------|---------|-------------|
| `engine` | `copilot` | AI engine: `copilot`, `codex`, `claude`, `opencode` |
| `modelProfiles` | (object) | Agent/model recommendations by task type (default, bugfix, review, security) |
| `agentRole` | `Senior Software Engineer` | Role injected into AGENTS.md |
| `agentStack` | `` | Tech stack for AGENTS.md |
| `agentProject` | `` | Project description for AGENTS.md |
| `agentCheckpoints` | (list) | Actions requiring confirmation |
| `maxLoops` | `5` | Max tasks per auto-run session |
| `freshContext` | `true` | Open new chat window per task |
| `prdPath` | `docs/ralph/prd.json` | Path to prd.json (relative to workspace). If the default path is missing and a root `prd.json` exists, Ralph uses the legacy root file. |
| `memoriesPath` | `.agent/memories.md` | Path to project memories file |
| `taskTimeoutMs` | `600000` | Max ms to wait per task (10 min) |
| `taskRetries` | `1` | Retries before marking as failed |
| `minWaitMs` | `15000` | Min wait before polling for completion |
| `pollIntervalMs` | `5000` | How often to check for completion |
| `guardrails` | (14 rules) | Rules injected in every task prompt |
| `boundaries` | `[]` | Paths the agent must never touch |
| `memoryOptimizeEvery` | `0` | Auto-optimize memories.md every N completed tasks (0 = off) |
| `memoryOptimizeReview` | `true` | Show optimization prompt in Chat for review before applying |

### Default guardrails

- Never modify prd.json
- Never delete files without confirmation
- Always include tests for new features
- Task states must be exactly: todo | inprogress | completed | blocked
- When a task is finished, write the completion signal and wait — do not generate extra questions
- Always read `.agent/memories.md` before starting any task
- Never commit secrets, API keys, tokens or passwords — use environment variables
- Always validate and sanitize user inputs
- Run existing tests before marking a task as completed
- Security checkpoints required for: auth changes, file deletions, DB schema changes, dependency upgrades
- All new code must follow conventions already present in the codebase
- Log important decisions in `.agent/memories.md`
- Never use placeholders or TODO comments in production code
- If blocked, write a clear explanation in the note signal — do not silently timeout

---

## GitHub integration

**⬆ GitHub** — sends a prompt to Copilot Chat that creates GitHub Issues for all pending issues via MCP, with labels, acceptance criteria checklist, and a `Ralph Suite ID: ISSUE-NNN` reference in the body.

**⬇ Sync** — remains a chat prompt for bulk/manual synchronisation that reads closed/assigned GitHub Issues and writes the corresponding `.ralph/task-*-status` files back locally, syncing the board. `ralph-suite.syncIssue` is also a public command for one explicit GitHub issue/status transition. It requires workspace trust, accepts issue numbers `1..999999`, statuses `todo`, `inprogress`, `blocked` or `completed`, and an optional workspace root that must be allowlisted. The command matches exactly one local task through the labels `github:#N` or `owner/repo#N`. It never infers `ISSUE-00N` from GitHub `#N`, never modifies `prd.json`, and writes only `.ralph/task-<local-id>-status`. The published 1.11.1 asset contains it.

Requires the GitHub MCP connector enabled in VSCode.

## Optional host: Alfred Dev

[Alfred Dev for VS Code](https://github.com/SrScorpio/alfred-dev-vscode) can wrap Ralph when this extension is installed **and** active (`ralph-suite.ralph-suite`). Alfred does **not** list Ralph as `extensionDependencies`: a user without Ralph keeps a full Alfred install.

| Layer | Owner | Path / API |
|-------|--------|------------|
| Collaborative work | Alfred / GitHub Issues+PRs | GitHub |
| Local backlog | Ralph | `docs/ralph/prd.json` (`ralph-suite.prdPath`; legacy root `prd.json` still loads) |
| Local runtime | Ralph | `.ralph/task-<ID>-status`, `-note`, `-log.json` |
| Stable project memory | Ralph | `.agent/memories.md` |

Public commands a host may feature-detect:

- `ralph-suite.openKanban`
- `ralph-suite.runTask` — optional `taskId` argument (`ISSUE-001`); otherwise next pending
- `ralph-suite.startRunner` / `ralph-suite.stopRunner` — require the Kanban webview

In a multi-root window, Ralph prefers the folder that actually has a resolvable PRD (`docs/ralph/prd.json` or legacy root `prd.json`). If none do, it falls back to the first folder and keeps the existing errors (`No workspace open` / `No prd.json found`).

Paired issues: [ralph-suite#1](https://github.com/SrScorpio/ralph-suite/issues/1), [alfred-dev-vscode#40](https://github.com/SrScorpio/alfred-dev-vscode/issues/40). `alfred-dev-vscode#3` remains open for the separate parallel-dispatch scope. ADR-016 reserves any future scheduler for Ralph's runner; Alfred does not launch N concurrent `runTask` calls.

---

## Init Project flow

1. Click **Init Project** (board or quick menu)
2. Describe your project goal in the input box
3. Chat opens with a structured prompt that asks clarifying questions
4. Once you've answered, the agent generates the docs/ tree in one go:
   - `AGENTS.md` — agent manual with your guardrails and checkpoints
   - `.github/copilot-instructions.md` — references AGENTS.md
   - `docs/project/architecture.md` — architecture decisions
   - `docs/project/threat-model.md` — security rules and secrets
   - `docs/project/status.md` — human snapshot (not the Kanban)
   - `docs/adr/ADR-001-project-setup.md` — ADR decision log
   - `docs/ralph/IMPLEMENTATION_PLAN.md` — optional human plan
   - `docs/ralph/prd.json` — initial task backlog
5. Board detects PRD creation at the resolved path and opens automatically

---

## Import Plan

If you have a Plan agent markdown file (from Copilot's `/plan` command):

1. Open the markdown file in the editor — or use the file picker
2. Click **⬇ Plan** on the board
3. If `prd.json` exists → choose **Append** or **Overwrite**
4. Steps are parsed into issues with sequential dependencies and epic auto-detection

---

## Keyboard shortcut

`Ctrl+Shift+R` / `Cmd+Shift+R` → Open board

---

## Architecture notes

- No CLI dependencies — runs entirely inside VSCode
- WebviewPanel with shell + postMessage architecture (shell loaded once, data updated via messages)
- File watchers on `.ralph/` detect agent completion signals in real time
- `.ralph/` is gitignored automatically — only `docs/` (including `docs/ralph/prd.json`) and `.agent/memories.md` are committed. Loop scratch belongs in `.ralph/progress.md`, never `docs/progress.md`.
- Compatible with Copilot Chat, Claude, and any chat engine accessible via `workbench.action.chat.open`

---

## Version

Current published version: **1.11.1** — see [CHANGELOG.md](CHANGELOG.md) for full history. Distributed from GitHub Releases only (no Marketplace).
