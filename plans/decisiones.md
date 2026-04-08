# Decisiones Arquitectónicas (ADR)

Fecha: 1 de abril de 2026

## ADR-001 — Elección de stack
- Estado: accepted
- Contexto: Proyecto como extensión de VS Code con web UI.
- Decisión: Usar TypeScript + Node.js (VS Code Extension API) y webview ligero (HTML/CSS/vanilla JS) por defecto.
- Consecuencias: Desarrollo alineado con ecosistema VS Code; permite migración a frameworks en el futuro.

## ADR-002 — Memory injection por secciones
- Estado: accepted
- Contexto: Inyección indiscriminada de `memories.md` provoca prompts excesivos.
- Decisión: Inyección por secciones: `Core` y `Conventions` siempre; `Decisions` sólo si la tarea depende de ellas; `Task History` NUNCA inyectada automáticamente.
- Consecuencias: Menor tamaño de contexto y mejor relevancia del prompt.

## ADR-003 — Task splitting automático (sugerencia)
- Estado: proposed
- Contexto: Tareas largas pueden necesitar subdivisión.
- Decisión: Implementar sugerencia automática si una tarea supera `ralph-suite.splitSuggestAfterMs`.
- Consecuencias: Mejora del flujo para tasks P0 complejas; mayor complejidad en creación/gestión de issues.

## ADR-004 — Git checkpoint opcional
- Estado: accepted (opt-in)
- Contexto: Necesidad de rollback rápido en trabajos locales.
- Decisión: Añadir `ralph-suite.gitCheckpoint` (default false). Si está activa, crear commit o stash antes de ejecutar tareas críticas.
- Consecuencias: Proporciona puntos de restauración; riesgo de commits automáticos que deben ser auditados.

## ADR-005 — Health score del proyecto
- Estado: proposed
- Contexto: Necesidad de métrica de salud basada en logs existentes.
- Decisión: Calcular score local desde `.ralph/task-*-log.json` y exponerlo en UI.

## ADR-006 — Dependency graph visual
- Estado: proposed
- Contexto: Dificultad para visualizar por qué una tarea está bloqueada.
- Decisión: Representar dependencias con SVG en la vista Epic.

## ADR-007 — Prompt templates por tipo de tarea
- Estado: proposed
- Contexto: Diferentes tipos de tareas requieren instrucciones distintas.
- Decisión: Mapear labels/epics a plantillas de prompt (feature, bugfix, refactor, test, deploy).

## ADR-008 — Resumen de sesión automático
- Estado: proposed
- Contexto: Cerrar sesiones manualmente es costoso.
- Decisión: Al parar el runner, consolidar notas y generar entrada en `memories.md`.
