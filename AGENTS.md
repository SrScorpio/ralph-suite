# AGENTS.md — Project Agent Manual
> Project: ralph-suite | Stack: VS Code Extension (TypeScript, Node.js, Webview) | Generated: 1 de abril de 2026

Always respond and write generated content in English, regardless of the language of files or user input. File names and the literal string "NOTA:" are fixed tokens and must not be translated.

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
- Important: Remove the previous status value before writing the new one when marking the task as completed
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

## Completion protocol
1. Overwrite (not append) .ralph/task-<ID>-status with the single word: completed
   The file must contain ONLY that word — no extra lines, no other content.
   The task ID must be explicitly stated in the task description (e.g., "ISSUE-001"). If no task ID is provided, ask the user for it before beginning. Do not invent or infer a task ID.
2. Write NOTA: <one line summary> to .ralph/task-<ID>-note
If writing either .ralph/ file fails, report the exact error to the user and do not silently proceed. Do not consider the task completed until both files are successfully written.
Then stop. No follow-up questions.
