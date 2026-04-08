# AGENTS.md — Project Agent Manual
> Project: ralph-suite | Stack: VS Code Extension (TypeScript, Node.js, Webview) | Generated: 1 de abril de 2026

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
- Never modify prd.json
- Never delete files without confirmation
- Always include tests for new features
- Important: Remove the status before marking the task as completed
- Never create more documentation in the plan folder if you do not have explicit references

## Checkpoints (stop and ask before these)
1. Delete files or directories
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

## Completion protocol
1. Overwrite (not append) .ralph/task-<ID>-status with the single word: completed
   The file must contain ONLY that word — no extra lines, no other content.
2. Write NOTA: <one line summary> to .ralph/task-<ID>-note
Then stop. No follow-up questions.
