# Decisiones Arquitectónicas (ADR)

Fecha: 5 de junio de 2026

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
- Estado: accepted (base inicial)
- Contexto: Diferentes tipos de tareas requieren instrucciones distintas.
- Decisión: Mapear señales de tarea (title, description, epic, labels) a `taskType` y resolver un perfil desde `ralph-suite.modelProfiles`. El prompt incluye engine, modelo recomendado y modo. La extensión no afirma poder fijar modelo si el proveedor no lo soporta.
- Consecuencias: Mejor compatibilidad con Copilot/Codex sin acoplarse a una API de modelo inexistente. Queda pendiente UI dedicada para seleccionar perfil por tarea.

## ADR-008 — Resumen de sesión automático
- Estado: proposed
- Contexto: Cerrar sesiones manualmente es costoso.
- Decisión: Al parar el runner, consolidar notas y generar entrada en `memories.md`.

## ADR-009 — Separación backlog/runtime/memoria estable
- Estado: accepted
- Contexto: Mezclar tareas completadas en `.agent/memories.md` ensucia prompts y contradice ADR-002, que evita inyectar historial completo.
- Decisión: `prd.json` representa backlog; `.ralph/` representa runtime/historial; `.agent/memories.md` representa memoria estable. `NOTA:` normal queda en log runtime. Sólo `DECISION:`, `MEMORIA:`, `BUG:` y `CONVENCION:` promocionan contenido a memoria estable.
- Consecuencias: Prompts más pequeños y memoria más útil. Requiere que agentes usen prefijos explícitos si quieren persistir conocimiento reutilizable.

## ADR-010 — Sanitización defensiva de webview y mensajes
- Estado: accepted
- Contexto: El webview renderiza HTML generado desde `prd.json`, logs, memoria y configuración. Sin escape de atributos/JS y sin validación de mensajes, un PRD manipulado puede ejecutar acciones en el extension host.
- Decisión: Añadir helpers de escape para HTML, atributos y argumentos JS; escapar dependencias y campos dinámicos; validar mensajes entrantes con allowlist de IDs, status, priority, arrays y campos editables.
- Consecuencias: Reduce riesgo XSS y abuso de `postMessage`. Deuda pendiente: CSP estricta, nonce y sustitución de handlers inline por listeners.

## ADR-011 — IDs seguros para estado local
- Estado: accepted
- Contexto: Los IDs de tareas se usan en rutas `.ralph/task-<ID>-status`, `.ralph/task-<ID>-note` y `.ralph/task-<ID>-log.json`.
- Decisión: Todos los IDs usados en rutas pasan por `safeTaskId`, limitado a caracteres seguros y longitud máxima.
- Consecuencias: Evita traversal y nombres de fichero peligrosos. Los IDs del PRD también se normalizan al cargar para evitar duplicados y entradas inválidas.

## ADR-012 — Tests Node con mock de VS Code
- Estado: accepted
- Contexto: Los tests unitarios importan módulos que dependen de `vscode`, pero Mocha corre fuera del extension host.
- Decisión: Añadir `src/test/vscodeMock.js` y cargarlo con `--require` en `npm test`.
- Consecuencias: Los tests de builders, sanitización y lógica local pueden ejecutarse en Node sin `vscode-test`. Los tests de integración real de VS Code siguen pendientes.

## ADR-013 — Acceso centralizado al PRD
- Estado: accepted
- Contexto: `kanbanPanel.ts` tenía lecturas/escrituras directas de `prd.json` en reorder, edit, add e import. Eso duplicaba lógica, dificultaba validar y aumentaba riesgo de corrupción del backlog.
- Decisión: Centralizar el acceso raw en `PrdManager`: `loadRaw`, `saveRaw`, `mutateRaw`, `rawItems` y `setRawItems`. Las escrituras usan archivo temporal y `rename` final.
- Consecuencias: Menos escrituras dispersas y base para validación/backup/configuración futura. Los comandos resuelven el backlog con `ralph-suite.prdPath` (por defecto `docs/ralph/prd.json`; si falta, `prd.json` legado en raíz). No hay escrituras agenticas a `prd.json`.

## ADR-014 — Modularización post-refactor y cleanup
- Estado: accepted
- Contexto: Tras varias iteraciones, `extension.ts` (822 lines) y `kanbanPanel.ts` (1 020 lines) superan el umbral de gestión cómoda. Además existen problemas menores arrastrados: `output.show()` en activación roba el foco, parámetro fantasma en `setupProject`, CSS duplicado en `kanbanHtml.ts`, y promesas sin manejar en `KanbanPanel.sendMessage()`.
- Decisión: Reestructurar en módulos cohesivos por responsabilidad:
  - `src/extension.ts` → solo `activate`/`deactivate` (boleilerplate VS Code).
  - `src/activate.ts` → `_doActivate`: registro de comandos y watchers.
  - `src/commands/menu.ts` → `showMenu` (quick pick).
  - `src/commands/project.ts` → `initProject`, `setupProject`.
  - `src/commands/task.ts` → `runTaskWithRetry`, `sleep`.
  - `src/commands/memory.ts` → `optimizeMemory`.
  - `src/promptBuilders.ts` → `buildPrompt`, `buildInitPrompt`, `inferTaskType`, `resolveAgentProfile`.
  - `src/agentsMdBuilders.ts` → `buildAgentsMd`, `buildCopilotInstructions`, `buildArquitecturaMd`, `buildSeguridadMd`, `buildDecisionesMd`.
  - `src/kanban/contextRefresh.ts` → `buildContextRefreshPrompt`.
  - `src/kanban/gitHubSync.ts` → `buildPushPrompt`, `buildSyncPrompt`.
  - `src/kanban/planImport.ts` → `importPlanToPrd`, `generateNextId`, `buildAddFromChatPrompt`.
  - `src/stateManager.ts`, `src/prdManager.ts`, `src/contextInjector.ts` y `src/webview/kanbanHtml.ts` no se modifican.
- Consecuencias: Mayor mantenibilidad, ficheros con responsabilidad única (~50-150 líneas cada uno), y menos acoplamiento. Los tests existentes requieren solo ajuste de imports. El cleanup elimina 4 bugs/olores menores sin cambio funcional.

## ADR-015 — Limpieza de settings muertos y cableado de memoriesPath
- Estado: accepted
- Fecha: 2026-08-02
- Contexto: La auditoría de settings (v1.8.0) detectó que `ralph-suite.autoRun` y `ralph-suite.memoryOptimizeAutoApply` estaban declarados en `package.json` pero nunca se leían del config en ningún punto del código. Por el contrario, `ralph-suite.memoriesPath` estaba declarado pero su ruta (`.agent/memories.md`) estaba *hardcodeada* en 4 archivos, ignorando el setting. La descripción de `engine` en los NLS omitía `codex` pese a estar en el enum.

  Investigación del historial (`git log -G` sobre toda la historia del repo): `autoRun` y `memoryOptimizeAutoApply` **nunca fueron cableados**, ni siquiera en el primer commit. `autoRun` estaba presente desde v0.1.0 (18 mar 2026) como setting huérfano.

  Análisis de intención original:
  - `autoRun`: su descripción ("auto-start next task when current completes") duplicaba la funcionalidad del runner, que ya encadena tareas al pulsar ⚡ Start. El campo `this.autoRun` (instancia) controla el estado del runner y lo setean los botones del board; el setting de config era un concepto paralelo que nunca se conectó. La autonomía real (auto-arrancar el runner al abrir el board) no estaba implementada.
  - `memoryOptimizeAutoApply`: inverso lógico de `memoryOptimizeReview` (`autoApply=true` ≡ `review=false`). Su probable intención era distinguir comando manual vs auto-trigger (`memoryOptimizeEvery`), pero ambos caminos terminan en `ralph-suite.optimizeMemory`, que ya lee `memoryOptimizeReview`.

- Decisión:
  1. **Eliminar** `ralph-suite.autoRun` y `ralph-suite.memoryOptimizeAutoApply` (settings huérfanos). El runner se controla exclusivamente vía UI (botones ⚡/⏹). Si en el futuro se quiere autonomía al abrir el board, se reintroduce como nuevo setting *cableado desde el inicio*.
  2. **Cablear** `ralph-suite.memoriesPath`: sustituir las 4 rutas hardcodeadas por lectura del setting (`memory.ts`, `project.ts`, `contextInjector.ts`, `kanbanPanel.ts`, `promptBuilders.ts`), con protección anti path traversal (espejando `PrdManager.prdPath`) y fallback a `.agent/memories.md`.
  3. **Consolidar** la dualidad manual/auto-trigger en un único `memoryOptimizeReview`, aplicable a ambos flujos.
  4. **Corregir** NLS: añadir `codex` a la descripción de `engine` (EN + ES).

- Consecuencias: Configuración coherente — todo lo declarado funciona, todo lo que funciona está declarado, las 17 claves NLS están sincronizadas EN/ES. Se evita la confusión de settings duales con semántica opuesta. Riesgo: si alguien había configurado `autoRun` o `memoryOptimizeAutoApply` en su `settings.json`, esas claves dejarán de tener efecto (no causan error, VS Code las ignora como settings desconocidos).

## ADR-016 — Dispatch paralelo propiedad del runner
- Estado: proposed
- Contexto: `alfred-dev-vscode#3` combina `syncIssue` con dispatch paralelo. El runner actual comparte un `KanbanPanel`, una señal de abort, la superficie de Chat de VS Code y polling sobre `.ralph`; Alfred no dispone de sesiones de Chat aisladas ni de leases por tarea.
- Decisión: cerrar el alcance actual con `ralph-suite.syncIssue` y no lanzar N llamadas concurrentes a `ralph-suite.runTask`. Si se retoma el paralelismo, debe ser un scheduler acotado propiedad de Ralph, con contexto, abort y lease por tarea.
- Consecuencias: se evita introducir carreras y se conserva el runner serial actual. #3 queda parcialmente resuelto hasta que exista un contrato de scheduler con aislamiento, límites de concurrencia, recuperación y validación de seguridad.
- Detalle: `docs/adr/ADR-016-dispatch-paralelo-propiedad-del-runner.md`.

## ADR-017 — Simplificar `modelProfiles`
- Estado: accepted
- Contexto: defaults obsoletos (`gpt-5`, `gpt-5-codex`, `security-audit`) y mezcla verbal con la paleta Alfred (`luna`/`terra`/`sol`). Ralph no fuerza modelo; solo recomienda en el prompt.
- Decisión: Opción A — Ralph recomienda `engine`/`model`/`mode` con vocabulario propio y defaults actuales (`model: ""`, modos `execute|review`). Alfred no se duplica. Híbrido descartado como over-engineering.
- Consecuencias: settings y prompt honestos; Kanban sin selector nuevo; no hay router de Chat. Detalle: `docs/adr/ADR-017-simplificar-model-profiles.md`.
