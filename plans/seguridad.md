# Seguridad — Ralph Suite

Fecha: 5 de junio de 2026

Principios generales
- Nunca almacenar secretos en el repositorio.
- Principio de menor privilegio para cualquier operación de FS o red.
- Validar y sanitizar todo input que venga del usuario o de la webview.
- Separar datos de backlog (`prd.json`), runtime (`.ralph/`) y memoria estable (`.agent/memories.md`).

Gestión de secretos
- No commitear `.env` ni credenciales. Mantener un `.env.example` con claves de ejemplo.
- Para tokens necesarios en tiempo de desarrollo o uso local, preferir `keytar` (almacenamiento seguro del sistema) o pedir al usuario que agregue variables de entorno.

Autenticación y tokens
- Cuando la extensión comunica con APIs remotas, usar OAuth2 o tokens con expiración y scopes mínimos.
- Nunca exponer tokens en la UI ni en logs sin enmascararlos.

CORS y comunicaciones remotas
- La extensión debe usar HTTPS para cualquier endpoint remoto.
- Validar origen en los endpoints que reciban peticiones desde la webview.
- Si la extensión abre un servidor local, documentar claramente el puerto y exigir autorización explícita del usuario.

Webview y Content Security Policy (CSP)
- Definir `Content-Security-Policy` estricta en el `webview`.
- Evitar `eval()` y cualquier ejecución de código remoto en el webview.
- Comunicar con el extension host vía `postMessage` y sanitizar datos antes de procesarlos.

Estado actual de webview
- `webview/kanbanHtml.ts` escapa contenido dinámico con helpers separados para HTML, atributos y argumentos JS.
- El contenido de `prd.json`, logs, memoria, labels, dependencias y criterios no debe renderizarse sin escape.
- Los mensajes recibidos desde webview pasan por allowlist de `id`, `status`, `priority`, arrays y campos editables en `kanbanPanel.ts`.
- Deuda pendiente: sustituir `innerHTML`/handlers inline por DOM APIs o listeners declarativos y activar CSP estricta con nonce.

Operaciones en el sistema de archivos
- Antes de borrar o sobrescribir ficheros, mostrar confirmación clara.
- Cualquier operación destructiva debe ser un punto de control documentado en `AGENTS.md`.
- Los IDs de tarea usados en rutas `.ralph/task-<ID>-*` deben pasar por `safeTaskId`.
- No construir rutas de escritura con input crudo de webview, PRD o agente.
- `prd.json` sólo debe escribirse desde workflows UI/import explícitos. Los prompts de ejecución agentica deben prohibir modificarlo.

Git checkpoints
- Si `ralph-suite.gitCheckpoint` está activado, el checkpoint debe crear un commit con un mensaje estándar y no incluir secretos.

Logging y datos sensibles
- Los logs en `.ralph/` deben evitar incluir PII o tokens. Si es necesario incluir información sensible, enmascararla.
- `NOTA:` normal se guarda como historial runtime, no como memoria estable.
- Sólo se promociona a `.agent/memories.md` contenido marcado con prefijos explícitos: `DECISION:`, `MEMORIA:`, `BUG:`, `CONVENCION:`.
- No guardar tokens ni secretos en notas, logs o memoria. Si aparecen, deben enmascararse antes de persistir.

Validación de datos
- `prdManager.ts` normaliza defensivamente `prd.json`: strings, arrays, IDs, duplicados, prioridad y estado.
- IDs inválidos se convierten a nombres seguros; IDs duplicados se desambiguan.
- Las dependencias se normalizan como IDs seguros. Una dependencia inexistente bloquea la tarea hasta completarse o corregirse.
- Los campos de edición desde webview se limitan por allowlist y longitud máxima.

Despliegue y firma
- Requerir que Releases de VS Code estén firmados/packaged correctamente via `vsce`.

Incidentes
- Documentar en `plans/decisiones.md` y en `.agent/memories.md` cualquier incidente de seguridad y las acciones tomadas.

Deuda prioritaria
- CSP estricta con nonce.
- Eliminar `innerHTML` para datos no confiables o encapsular render en plantillas DOM seguras.
- Sustituir handlers inline (`onclick`, drag handlers inline) por `addEventListener`.
- Añadir validación de esquema formal para `prd.json` cuando se acepte una dependencia de schema validator o se implemente validador local completo.
