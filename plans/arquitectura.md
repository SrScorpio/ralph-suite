# Arquitectura — Ralph Suite

Fecha: 5 de junio de 2026

Resumen
-------
Ralph Suite es una extensión de VS Code (TypeScript/Node.js) que provee un tablero Kanban y un runtime local para tareas agenticas. El almacenamiento principal de backlog es `prd.json` en la raíz. El estado de ejecución vive en `.ralph/`. La memoria estable vive en `.agent/memories.md`. El agente corre desde prompts generados por la extensión y la UI está en un `webview` ligero.

Componentes principales
- `extension.ts` — punto de entrada y comandos de VS Code.
- `kanbanPanel.ts` — lógica del webview y comunicación con el extension host.
- `prdManager.ts` — acceso centralizado al PRD: lectura raw, normalización defensiva, mutación de items y escritura atómica con archivo temporal + rename.
- `stateManager.ts` — manejo de estados locales, rutas seguras, `.ralph/` logs y promoción controlada de memoria estable.
- `webview/kanbanHtml.ts` — HTML/JS del tablero (sin framework por defecto), con escape explícito para HTML, atributos y argumentos JS.
- `.agent/memories.md` — memoria estable del proyecto, separada del historial runtime. Secciones principales: Project, Conventions, Decisions, Known Issues.
- `.ralph/task-<ID>-log.json` — historial runtime por tarea. No debe mezclarse con memoria estable salvo promoción explícita.

Decisiones de diseño relevantes
- Backlog vs runtime: `prd.json` es fuente de verdad del backlog; `.ralph/` es fuente de verdad del estado de ejecución.
- Memoria segmentada: la inyección en prompts se realiza por secciones estables. El historial completo no se inyecta automáticamente — ver `plans/decisiones.md`.
- Promoción de memoria: `NOTA:` se guarda en logs; sólo `DECISION:`, `MEMORIA:`, `BUG:` y `CONVENCION:` promocionan contenido a `.agent/memories.md`.
- UI ligera: el webview evita librerías pesadas por defecto; la estructura permite migración a React si la complejidad lo requiere.
- Runner local: el ciclo de ejecución del agente se controla por config (`ralph-suite.maxLoops`, `taskTimeoutMs`, `taskRetries`) y emite logs en `.ralph/task-<ID>-log.json`.
- Perfiles agenticos: `ralph-suite.engine` y `ralph-suite.modelProfiles` permiten recomendar motor/modelo/modo por tipo de tarea. La extensión no fuerza modelos cuando el proveedor de chat no lo permite; inyecta recomendación explícita en el prompt.

Integraciones y extensibilidad
- Git (opcional futuro): `ralph-suite.gitCheckpoint` permite puntos de control locales.
- GitHub/Copilot actual: la extensión genera prompts para crear/sincronizar issues; la sincronización determinista vía API queda pendiente.
- Codex/Copilot: los prompts incluyen perfil agente, modo, preservación de cambios ajenos, verificación y protocolo de completado.

Configuraciones relevantes
- `ralph-suite.prdPath` (por defecto `prd.json`)
- `ralph-suite.memoriesPath` (por defecto `.agent/memories.md`)
- `ralph-suite.engine` (`copilot`, `codex`, `claude`, `opencode`)
- `ralph-suite.modelProfiles` (perfiles recomendados por tipo: default, bugfix, review, security)
- `ralph-suite.gitCheckpoint` (boolean)
- `ralph-suite.splitSuggestAfterMs` (número, 0 desactivado)

Pruebas y CI
- `npm run compile` compila TypeScript.
- `npm test` ejecuta Mocha con `ts-node/register` y mock local de `vscode`.
- Tests actuales cubren inyección de contexto, context refresh, sanitización webview, normalización de PRD y promoción de memoria.

Notas
- No modificar `prd.json` desde agentes salvo workflow explícito autorizado. La UI puede añadir/editar/importar backlog como workflow de producto, pero los prompts de ejecución siguen prohibiendo modificar `prd.json`.
