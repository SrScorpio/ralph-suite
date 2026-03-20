# Decision Log — Project

> Architecture Decision Records (ADRs).
> Document WHY decisions were made, not just what was decided.
> The agent reads this to avoid undoing intentional choices.

## Format

```markdown
### ADR-NNN: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated

**Context:** Why did this decision need to be made?

**Decision:** What was decided?

**Consequences:**
- ✅ [benefit]
- ⚠️ [trade-off]

**Alternatives considered:**
- [Option A] — rejected because [reason]
```

---

## Decisions

### ADR-001: Initial project setup

**Date:** 2026-03-20
**Status:** Accepted

**Context:** Project initialised with Ralph Suite.

**Decision:** Use `prd.json` for task tracking, `.agent/memories.md` for persistent context, and `plans/` for architectural documentation.

**Consequences:**
- ✅ Single source of truth for tasks and architecture
- ✅ Agent has persistent context across sessions
- ⚠️ Requires keeping plans/ updated as the project evolves

---

*Add a new ADR every time a significant technical decision is made.*
