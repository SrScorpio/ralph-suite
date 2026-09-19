# Copilot instructions for ralph-suite

Consulta [AGENTS.md](../AGENTS.md) antes de cualquier cambio importante.

Reglas críticas:
- Responde en el idioma del usuario y conserva el idioma existente del código y la documentación.
- Nunca modificar `prd.json` ni borrar ficheros.
- Las referencias GitHub usan `owner/repo#N`; GitHub asigna `N`. `ADR-NNN` se reserva para decisiones.
- El ID local Ralph es exactamente el del backlog y el contexto del runner. No equivale automáticamente a un issue GitHub ni se renumera o migra.
- `ralph-suite.syncIssue` solo mapea GitHub→Ralph mediante labels explícitos `github:#N` u `owner/repo#N`; nunca infiere `ISSUE-00N` desde GitHub `#N` y solo escribe runtime `.ralph`, nunca `prd.json`.
- La ruta del backlog local es `ralph-suite.prdPath` (por defecto `docs/ralph/prd.json`; el `prd.json` heredado de la raíz sigue cargándose si falta el predeterminado). Las lecturas previas obligatorias de este repositorio siguen siendo `.agent/memories.md` y `plans/*` hasta que esos ficheros de planes se actualicen explícitamente.
- Solo una ejecución Ralph con contexto explícito, ID local y raíz puede escribir señales `.ralph`. Si falta contexto en una ejecución Ralph, solicítalo. El trabajo ad hoc, análisis, revisión, documentación y handoff no exige ID ni señales.
- Conserva el overwrite exacto de `completed` y la línea `NOTA:` únicamente al completar todo el alcance y las gates; nunca durante revisión, rechazo o handoff parcial.
- Commits únicamente con autorización explícita. No commitear secretos.
- Añadir tests para funcionalidades nuevas y ejecutar los tests existentes.
