# Ralph Suite — VSCode Extension

Autonomous AI task runner with Kanban board, project memory and multi-engine support.  
Inspired by the RALPH Wiggum technique. Designed for VSCode without CLI dependencies.

---

## Install (no Marketplace needed)

```bash
# 1. Clone / copy this folder
cd ralph-suite

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Package as .vsix
npm run package
# → creates ralph-suite-0.1.0.vsix

# 5. Install in VSCode
# Extensions panel → ⋯ → Install from VSIX → select the file
```

---

## Quick Start

1. Open a project in VSCode
2. Press `Ctrl+Shift+R` (or Command Palette → **Ralph: Open Board**)
3. If no `prd.json` exists → click **Init Project** → describe your goal in Chat
4. Once `prd.json` is created, click **↻ Refresh** on the board
5. Click **▶ Run** on any issue to send it to the AI chat

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
**Status:** managed automatically via `.ralph/` — don't edit manually

---

## Memory system

Create `.agent/memories.md` in your project root.  
The agent reads this on every task — use it for:

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
```

Click **🧠 Memories** on the board to edit it directly.

---

## Configuration

`Ctrl+,` → search **Ralph Suite**

| Setting | Default | Description |
|---------|---------|-------------|
| `ralph-suite.engine` | `copilot` | AI engine: `copilot`, `claude`, `opencode` |
| `ralph-suite.maxLoops` | `5` | Max tasks per run session |
| `ralph-suite.autoRun` | `false` | Auto-start next task on completion |
| `ralph-suite.guardrails` | (see below) | Rules injected in every prompt |
| `ralph-suite.boundaries` | `[]` | Paths the agent must never touch |

Default guardrails:
- Never modify prd.json
- Never delete files without confirmation  
- Always include tests for new features

---

## Board columns

| Column | Meaning |
|--------|---------|
| **To Do** | Pending, ready to run |
| **In Progress** | Currently being executed |
| **Done** | Completed (with ✓ Done button) |
| **Blocked** | Waiting on dependencies |

Issues with unresolved dependencies auto-move to **Blocked**.

---

## Keyboard shortcut

`Ctrl+Shift+R` / `Cmd+Shift+R` → Open board

---

## Roadmap

- [ ] Drag-and-drop between columns
- [ ] Atlassian MCP integration (import from Jira)
- [ ] GitHub Issues sync
- [ ] Multi-engine selector per task
- [ ] Sprint view (group by epic)
- [ ] Auto-run loop with configurable max iterations
