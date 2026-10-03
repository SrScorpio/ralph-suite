# Plan de pruebas: modelProfiles honestos (ADR-017 / ralph-suite#10)

## Objetivo y gate

Validar ADR-017 opción A: `ralph-suite.modelProfiles` recomienda `engine`/`model`/`mode` con vocabulario Ralph, defaults actuales y allowlist. Sin paleta Alfred, sin UI nueva en Kanban, sin tocar `prd.json` ni `syncIssue`. Gate: tests en verde, CI `build` success en el SHA del PR y cero hallazgos bloqueantes.

PR: [SrScorpio/ralph-suite#15](https://github.com/SrScorpio/ralph-suite/pull/15) (`Closes #10`)
SHA: `64afdee20606bc3c53232570afaf39c66abc14d0`

## Cobertura actual

| Área | Tipo | Evidencia | Estado |
| --- | --- | --- | --- |
| Defaults `copilot` + `model: ""` + `execute`/`review` | Contrato unitario | `src/test/modelProfiles.test.ts` lee `package.json` | Cubierto |
| Ausencia de `gpt-5`, `gpt-5-codex`, `security-audit` en defaults | Contrato | Mismo test + grep de `package.json` | Cubierto |
| `inferTaskType` por señales (security/review/bugfix/test/docs/refactor/default) | Unitario | `inferTaskType (ADR-017)` | Cubierto (happy path) |
| Fallback `test`/`docs`/`refactor` → `profiles.default` | Unitario | `resolveAgentProfile` | Cubierto |
| Override de perfil | Unitario | engine/model/mode custom | Cubierto |
| `model` vacío / no-string / control chars | Unitario | trim + strip `\u0000-\u001F\u007F` | Cubierto |
| Modo inválido (`security-audit`) y engine desconocido | Unitario | allowlist → `execute` o `review` según `taskType` | Cubierto |
| No leer `alfred-dev.modelProfile` | Unitario | `getConfiguration` no pide sección `alfred-dev` | Cubierto |
| Prompt: recomendación + provider default + sin paleta | Unitario | `buildPrompt` | Cubierto |
| Schema JSON + NLS EN/ES | Contrato | `package.json` / `package.nls*.json` | Cubierto |
| Kanban sin selector de perfil | Diff / regresión | PR no toca `kanbanHtml.ts` ni `kanbanPanel.ts` | Cubierto por revisión |
| CI compile → test → package | Integración | check run `build` success en el SHA | Cubierto |
| Suite completa | Regresión | `npm test`: 166 passing | Cubierto |

## Casos priorizados por riesgo

| Prioridad | Área y escenario | Tipo | Resultado esperado |
| --- | --- | --- | --- |
| Crítica | Defaults siguen ofreciendo `gpt-5` / `security-audit` | Contrato | `package.json` default = copilot + `""` + execute (review en review) |
| Crítica | `mode: "security-audit"` en settings de usuario | Unitario / migración | Runtime lo baja a `execute` (o `review` si el tipo es review); changelog lo documenta |
| Crítica | Engine desconocido o paleta Alfred como engine | Unitario | Allowlist → `copilot`; no se interpola `luna`/`terra`/`sol` como engine |
| Crítica | Prompt afirma que fuerza el modelo | Contrato / prompt | Texto de recomendación manual; launcher sigue siendo `chat.open` |
| Alta | `test`/`docs`/`refactor` sin fila en el setting | Unitario | Caen a `profiles.default` (execute + copilot + model vacío) |
| Alta | Override de usuario `bugfix.engine=codex` | Unitario | Se respeta si está en la allowlist |
| Alta | UI Kanban con picker de perfil | Diff / E2E manual | No hay control nuevo; Settings sigue abriendo `ralph-suite` |
| Alta | Título con `preview` (contiene `review`) | Edge / heurística | Hoy clasifica `review` y pone `mode: review`. Hueco: no hay test de falso positivo |
| Media | `mode: " execute "` (espacios) vs engine que sí hace `trim` | Edge | Mode inválido → fallback. Engine `" copilot "` sí pasa |
| Media | `model` con saltos de línea / NUL | Seguridad residual | Se recortan C0; no se puede inyectar una línea nueva en el prompt |
| Media | NLS EN vs ES desalineados | Contrato ADR-015 | Ambas claves `config.engine.description` y `config.modelProfiles.description` existen |
| Baja | Schema de los 4 perfiles duplicado | Mantenibilidad | Cambio de enum hay que tocarlo 5 veces (4 keys + additionalProperties) |
| Baja | Título `author`/`docker` dispara `auth`/`doc` | Edge preexistente | Con defaults honestos el perfil resuelto es el mismo que `default` (execute) |

## Huecos que no bloquean este PR

1. `inferTaskType` usa substrings (`review` ⊂ `preview`, `auth` ⊂ `author`, `doc` ⊂ `docker`). Con los defaults nuevos solo `review` cambia el `mode`; el resto es no-op salvo override del usuario.
2. El test de NLS que menciona luna/terra/sol es tautológico: pasa si el texto dice «do not use luna».
3. No hay E2E de Settings UI ni de que `chatLauncher` ignore el perfil (ya cubierto por el contrato del launcher: no hay router).
4. `allowlistedMode` no hace `trim()`; `allowlistedEngine` sí.

## Exploratorio (esta sesión)

- Objetivo: romper defaults, allowlist, paleta Alfred y Kanban.
- Duración equivalente: ~45 min.
- SHA local = SHA del PR. Working tree limpio. No merge.
- `npm test`: 166 passing (504ms).
- `get_check_runs` en `64afdee20606bc3c53232570afaf39c66abc14d0`: job `build` `completed`/`success`.
- Diff: 9 ficheros; cero cambios de webview/kanban; cero `prd.json`; cero `syncIssue`.
- Grep de producto: `gpt-5` / `security-audit` / paleta Alfred no están en `package.json` ni en el prompt por defecto.
- Hallazgo exploratorio: `"Add a preview of the feature"` → `inferTaskType` = `review` porque `/review/` coincide dentro de `preview`.
