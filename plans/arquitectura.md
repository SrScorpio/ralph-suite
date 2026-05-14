# Arquitectura — Ralph Suite

Fecha: 1 de abril de 2026

Resumen
-------
Ralph Suite es una extensión de VS Code (TypeScript/Node.js) que provee un tablero Kanban y un runner para agentes locales. El almacenamiento principal de requisitos/tareas es `prd.json` en la raíz. El agente corre en el proceso de extensión (extension host) y la UI está en un `webview` ligero.

Componentes principales
- `extension.ts` — punto de entrada y comandos de VS Code.
- `kanbanPanel.ts` — lógica del webview y comunicación con el extension host.
- `prdManager.ts` — lectura/validación/escritura (solo por workflows autorizados) de `prd.json`.
- `stateManager.ts` — manejo de estados locales y `.ralph/` logs.
- `webview/kanbanHtml.ts` — HTML/JS del tablero (sin framework por defecto).
- `.agent/memories.md` — memoria del proyecto, secciones definidas (Core, Conventions, Decisions, Task History).

Decisiones de diseño relevantes
- Single Source of Truth: `prd.json` en la raíz es la fuente de verdad para issues/epics.
- Memoria segmentada: la inyección en prompts se realiza por secciones (Core, Conventions, Decisions, Task History) — ver `plans/decisiones.md`.
- UI ligera: el webview evita librerías pesadas por defecto; la estructura permite migración a React si la complejidad lo requiere.
- Runner local: el ciclo de ejecución del agente se controla por config (`ralph-suite.maxLoops`, `taskTimeoutMs`, `taskRetries`) y emite logs en `.ralph/task-<ID>-log.json`.

Integraciones y extensibilidad
- Git (opcional): `ralph-suite.gitCheckpoint` permite puntos de control locales.
- Plugins futuros: soporte para adaptar prompt templates por label/epic.

Configuraciones relevantes
- `ralph-suite.prdPath` (por defecto `prd.json`)
- `ralph-suite.memoriesPath` (por defecto `.agent/memories.md`)
- `ralph-suite.gitCheckpoint` (boolean)
- `ralph-suite.splitSuggestAfterMs` (número, 0 desactivado)

Pruebas y CI
- Recomendado: `mocha` o `vscode-test` para pruebas de la extensión. Las nuevas features deben incluir tests (unit o integración) y estar cubiertas por scripts de CI.

Notas
- No modificar `prd.json` manualmente en workflows automatizados sin pasar por los checkpoints definidos en `AGENTS.md`.
