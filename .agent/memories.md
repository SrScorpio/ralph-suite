# Project Memories

## Project
- Goal: VS Code extension for PRD-based task management with Kanban webview UI
- Created: 2026-04-01

## Conventions
- camelCase for variables and functions
- PascalCase for classes and interfaces
- Always use strict TypeScript

## Decisions
- ADR-001: Use webview for UI (not native panels)
- ADR-002: Section-based memory injection — Core+Conventions always injected, Decisions only when task depends on them, Task History never auto-injected

## Completed Tasks
- [2026-04-08] **ISSUE-002:** Implemented contextInjector.ts with section-based memory injection (ADR-002). Updated buildPrompt in extension.ts and initMemories in stateManager.ts. 28 tests.
- [2026-06-05] **ISSUE-001:** Context Refresh mid-task.
- [2026-06-05] **ISSUE-013:** Centralized raw PRD access via PrdManager with atomic writes, configurable prdPath, and tests.