# Project Memories

## Project
- Goal: Implementar las mejoras que comentare a continuacion 
- Created: 2026-04-01

## Conventions
- camelCase for variables and functions
- PascalCase for classes and interfaces
- Always use strict TypeScript

## Decisions
- ADR-001: Use webview for UI (not native panels)
- ADR-002: Section-based memory injection (ISSUE-002)

## [2026-04-08] ISSUE-002: Task context injection inteligente
- **Duration:** 13 min
- **Note:** Implemented contextInjector.ts with section-based memory injection (ADR-002): Core+Conventions always injected, Decisions only when task depends on them, Task History never auto-injected. 28 tests passing. Updated buildPrompt in extension.ts and initMemories in stateManager.ts.