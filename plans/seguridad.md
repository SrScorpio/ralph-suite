# Seguridad — Ralph Suite

Fecha: 1 de abril de 2026

Principios generales
- Nunca almacenar secretos en el repositorio.
- Principio de menor privilegio para cualquier operación de FS o red.
- Validar y sanitizar todo input que venga del usuario o de la webview.

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

Operaciones en el sistema de archivos
- Antes de borrar o sobrescribir ficheros, mostrar confirmación clara.
- Cualquier operación destructiva debe ser un punto de control documentado en `AGENTS.md`.

Git checkpoints
- Si `ralph-suite.gitCheckpoint` está activado, el checkpoint debe crear un commit con un mensaje estándar y no incluir secretos.

Logging y datos sensibles
- Los logs en `.ralph/` deben evitar incluir PII o tokens. Si es necesario incluir información sensible, enmascararla.

Despliegue y firma
- Requerir que Releases de VS Code estén firmados/packaged correctamente via `vsce`.

Incidentes
- Documentar en `plans/decisiones.md` y en `.agent/memories.md` cualquier incidente de seguridad y las acciones tomadas.
