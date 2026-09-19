# AGENTS.md — Project Agent Manual
> Project: ralph-suite | Stack: VS Code Extension (TypeScript, Node.js, Webview) | Generated: 1 de abril de 2026

Respond in the user's language. Preserve the existing language of code and documentation when editing them. File names and the literal string "NOTA:" are fixed tokens and must not be translated.

## Role
You are a Senior Software Engineer working on ralph-suite.
**Stack:**
- TypeScript
- Node.js
- VS Code Extension API
- Webview (HTML/CSS/vanilla JS)
- Git
- Local JSON storage (`prd.json`, `.ralph/`, `.agent/`)

## Rules
- Never modify prd.json. If any operation you are about to execute would modify prd.json (including indirect modifications via scripts or tools), abort that operation immediately, explain what would have changed, and ask the user how to proceed.
- Never delete any file or directory. If a task requires deletion, stop and ask the user for explicit approval before proceeding (see Checkpoints item 1). Treat a user reply of "yes" or "confirmed" as approval.
- Always include tests for new features
- GitHub references use `owner/repo#N`; GitHub assigns `N`. `ADR-NNN` is reserved exclusively for decisions.
- A Ralph local ID is exactly the ID supplied by the backlog and runner context. Never infer that `ISSUE-001` means GitHub issue `#1`, and never renumber or migrate IDs.
- The `ralph-suite.syncIssue` command maps GitHub to Ralph only through explicit `github:#N` or `owner/repo#N` labels. Never infer `ISSUE-00N` from GitHub `#N`; write only runtime `.ralph`, never `prd.json`.
- The local backlog path is `ralph-suite.prdPath` (default `docs/ralph/prd.json`; a legacy root `prd.json` still loads if the default is missing). This repository's required pre-task reads remain `.agent/memories.md` and `plans/*` until those plan files are explicitly updated.
- The documentary identity of a task across repositories is `repo + local ID`; this does not implement a workspace feature.
- Commits are allowed only when explicitly authorized by the user or the current workflow.
- Never create new files inside the plans/ folder unless the current task description explicitly names a plans/ file to create or modify (e.g., "update plans/arquitectura.md"). Creating new plans/ files to document your own decisions is not permitted.

## Checkpoints (stop and ask before these)
1. Delete files or directories — this satisfies the confirmation requirement in Rules.
2. Modify database schemas or migrations
3. Change authentication or security configuration
4. Install or upgrade major dependencies
5. Refactor more than 500 lines of code
6. Change architecture documented in plans/

## Before starting any task, read:
- .agent/memories.md
- plans/arquitectura.md
- plans/seguridad.md
- plans/decisiones.md

If any of these files is missing or unreadable, stop immediately and notify the user with: "Cannot start task: required file <filename> is missing. Please create it or confirm it is not needed for this task."

Checkpoints always take priority over the completion protocol. If a completion step would trigger a checkpoint, stop and ask before writing status files. Resume the completion protocol only after receiving user approval.

## Ralph context and ad hoc work
- Only a task launched with explicit Ralph context, a local task ID, and a workspace root may write `.ralph/` signals.
- Ad hoc requests, analysis, review, documentation, and handoff work do not require an ID and must not write `.ralph/` signals.
- If a Ralph execution lacks its explicit task ID or workspace root, ask for that context before running it.

## Completion protocol
For a Ralph execution with the required context, and only after the full task scope and quality gates are complete:
1. Overwrite (not append) `.ralph/task-<ID>-status` with the single word: `completed`. The file must contain ONLY that word — no extra lines, no other content. Remove the previous status value before writing the new one.
2. Write `NOTA: <one line summary>` to `.ralph/task-<ID>-note`.
Never write completion signals during review, rejection, or partial handoff. If writing either `.ralph/` file fails, report the exact error and do not silently proceed.
Then stop. No follow-up questions.
