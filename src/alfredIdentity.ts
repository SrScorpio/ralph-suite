/**
 * alfredIdentity.ts — Modo Alfred: detección, validación de identidad y silencio (ADR-018).
 *
 * Ralph detecta `SrScorpio.alfred-dev-vscode`, comprueba que anuncia el comando
 * `alfred-dev.ralph.announceIdentity` y valida el DTO v1 que este devuelve.
 * Si algo falla (sin trust, sin extensión, sin comando, timeout, versión
 * desconocida o DTO inválido) el modo NO se aplica: se cae a la ruta de hoy,
 * nunca a un modo a medias.
 *
 * Este módulo es el ÚNICO punto que lee `ralph-suite.alfredMode` y habla con
 * Alfred. No traduce vocabularios ni lee configuración ajena.
 */

import * as vscode from 'vscode';

/** Id de la extensión que anuncia la identidad (ADR-018 §2). */
export const ALFRED_EXTENSION_ID = 'SrScorpio.alfred-dev-vscode';
/** Comando público de identidad contribuido por Alfred (contrato DTO v1). */
export const ANNOUNCE_IDENTITY_COMMAND = 'alfred-dev.ralph.announceIdentity';
/** Tiempo máximo de espera de la identidad (ADR-018 §3). */
export const ANNOUNCE_TIMEOUT_MS = 1000;

/** Claves de acción que el DTO v1 debe traer todas. */
export const REQUIRED_ACTIONS = ['runTask', 'optimizeMemory', 'analyzeProject', 'initProject', 'syncIssue'] as const;
export type AlfredActionName = typeof REQUIRED_ACTIONS[number];

export interface AlfredAction {
	agent: string;
	mention: string;
	preamble: string;
}

export interface AlfredIdentity {
	contractVersion: 1;
	agentsMdOwner: string;
	actions: Record<AlfredActionName, AlfredAction>;
}

/** Resultado: modo Alfred efectivo con identidad validada. */
export interface AlfredModeReady {
	effective: true;
	identity: AlfredIdentity;
	/** Ajustes del usuario con `/plan/` o `plans/`, ignorados en modo Alfred. */
	ignoredOverrides: string[];
}

/** Resultado: modo Alfred NO efectivo — usar la ruta de hoy. */
export interface AlfredModeUnavailable {
	effective: false;
	reason: string;
	/** `true` si merece el aviso informativo único por sesión (§ Estrategia de errores). */
	warnOnce: boolean;
}

export type AlfredModeResolution = AlfredModeReady | AlfredModeUnavailable;

// ── Ajuste ───────────────────────────────────────────────────────────────────

/** Lee `ralph-suite.alfredMode` en cada acción, sin caché (ADR-018 §1). */
export function readAlfredMode(): string {
	try {
		const raw = vscode.workspace.getConfiguration('ralph-suite').get<string>('alfredMode', 'auto');
		return typeof raw === 'string' && raw.trim() ? raw.trim() : 'auto';
	} catch {
		return 'auto';
	}
}

/** El modo solo puede ser efectivo con `auto`; cualquier otro valor cae a hoy. */
export function isAlfredModeEnabled(): boolean {
	return readAlfredMode() === 'auto';
}

/**
 * Heurística SÍNCRONA para la UI (menú/tablero): ¿parece que el modo Alfred va a
 * aplicarse? No llama al comando (eso sería un efecto asíncrono); solo mira el
 * ajuste, el trust y el comando anunciado. La decisión real la toma
 * `resolveAlfredMode`.
 */
export function alfredModeUiActive(): boolean {
	if (!isAlfredModeEnabled()) { return false; }
	if (vscode.workspace.isTrusted !== true) { return false; }
	const extension = (vscode as any).extensions?.getExtension?.(ALFRED_EXTENSION_ID);
	return announcesIdentityCommand(extension);
}

// ── Avisos únicos por sesión ─────────────────────────────────────────────────

const warnedThisSession = new Set<string>();

/** Inyectable en tests para aislar el estado de "una vez por sesión". */
export function resetOnceWarnings(): void {
	warnedThisSession.clear();
}

/** Aviso informativo como máximo una vez por sesión (ADR-018 §6 y errores). */
export function warnOnce(key: string, message: string, output?: vscode.OutputChannel): void {
	output?.appendLine(`[Ralph][Alfred] ${message}`);
	if (warnedThisSession.has(key)) { return; }
	warnedThisSession.add(key);
	void vscode.window.showInformationMessage(message);
}

// ── Validación del DTO (fail-closed, un solo fallo invalida todo) ─────────────

const AGENT_ID = /^[a-z0-9-]{1,40}$/;
const PLAN_REFERENCE = /\/plan\/|plans\//;

function assertNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`campo ${field} ausente o vacío`);
	}
	return value;
}

function validateAction(name: AlfredActionName, raw: unknown): AlfredAction {
	if (!raw || typeof raw !== 'object') {
		throw new Error(`actions.${name} ausente`);
	}
	const action = raw as Record<string, unknown>;

	const agent = assertNonEmptyString(action.agent, `actions.${name}.agent`);
	if (!AGENT_ID.test(agent)) { throw new Error(`actions.${name}.agent fuera de formato`); }

	const mention = assertNonEmptyString(action.mention, `actions.${name}.mention`);
	if (mention !== `@${agent}`) { throw new Error(`actions.${name}.mention no corresponde al agente`); }

	// El modelo lo elige la ficha del subagente. Anunciarlo aquí sería un segundo dueño.
	if (action.provider !== undefined || action.model !== undefined) {
		throw new Error(`actions.${name} no anuncia proveedor ni modelo`);
	}

	const preamble = assertNonEmptyString(action.preamble, `actions.${name}.preamble`);
	if (/[\u0000-\u001F\u007F]/.test(preamble)) {
		throw new Error(`actions.${name}.preamble contiene caracteres de control`);
	}
	if (preamble.length > 200) {
		throw new Error(`actions.${name}.preamble supera 200 caracteres`);
	}
	if (PLAN_REFERENCE.test(preamble)) {
		throw new Error(`actions.${name}.preamble referencia plans/ o /plan/`);
	}

	return { agent, mention, preamble };
}

/**
 * Valida el DTO v1 de identidad. Lanza si cualquier campo no cumple el contrato:
 * un solo fallo invalida TODO el modo (nunca un modo a medias).
 */
export function validateAlfredIdentity(raw: unknown): AlfredIdentity {
	if (!raw || typeof raw !== 'object') {
		throw new Error('el comando no devolvió un objeto');
	}
	const dto = raw as Record<string, unknown>;

	if (dto.contractVersion !== 1) {
		throw new Error(`contractVersion no soportada: ${String(dto.contractVersion)}`);
	}

	const agentsMdOwner = assertNonEmptyString(dto.agentsMdOwner, 'agentsMdOwner');

	if (!dto.actions || typeof dto.actions !== 'object') {
		throw new Error('actions ausente');
	}
	const rawActions = dto.actions as Record<string, unknown>;

	const actions = {} as Record<AlfredActionName, AlfredAction>;
	for (const name of REQUIRED_ACTIONS) {
		actions[name] = validateAction(name, rawActions[name]);
	}

	return { contractVersion: 1, agentsMdOwner, actions };
}

// ── Detección de la capacidad anunciada ──────────────────────────────────────

/** ¿La extensión contribuye el comando de identidad en su `packageJSON`? (ADR-018 §2) */
export function announcesIdentityCommand(extension: { packageJSON?: { contributes?: { commands?: unknown } } } | undefined): boolean {
	const commands = extension?.packageJSON?.contributes?.commands;
	if (!Array.isArray(commands)) { return false; }
	return commands.some((entry: any) => entry && entry.command === ANNOUNCE_IDENTITY_COMMAND);
}

// ── Resolución del modo ──────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout de identidad')), timeoutMs);
		promise.then(
			value => { clearTimeout(timer); resolve(value); },
			error => { clearTimeout(timer); reject(error); },
		);
	});
}

/**
 * Resuelve el modo Alfred para ESTA acción. Fail-closed: cualquier fallo devuelve
 * `effective: false` con la ruta de hoy intacta.
 *
 * @param output si se pasa, la causa exacta se registra en el OutputChannel y,
 *   cuando procede, se emite un aviso informativo una vez por sesión.
 */
export async function resolveAlfredMode(output?: vscode.OutputChannel): Promise<AlfredModeResolution> {
	if (!isAlfredModeEnabled()) {
		return { effective: false, reason: `ralph-suite.alfredMode=${readAlfredMode()}`, warnOnce: false };
	}
	if (vscode.workspace.isTrusted !== true) {
		return { effective: false, reason: 'workspace sin trust', warnOnce: false };
	}

	const extensionsApi = (vscode as any).extensions;
	const extension = extensionsApi?.getExtension?.(ALFRED_EXTENSION_ID);
	if (!extension) {
		return { effective: false, reason: 'Alfred Dev no está instalado', warnOnce: false };
	}
	if (!announcesIdentityCommand(extension)) {
		output?.appendLine(`[Ralph][Alfred] ${ALFRED_EXTENSION_ID} no anuncia ${ANNOUNCE_IDENTITY_COMMAND}`);
		return { effective: false, reason: 'Alfred Dev no anuncia el comando de identidad', warnOnce: false };
	}

	let raw: unknown;
	try {
		raw = await withTimeout(
			Promise.resolve(vscode.commands.executeCommand(ANNOUNCE_IDENTITY_COMMAND)),
			ANNOUNCE_TIMEOUT_MS,
		);
	} catch (error: any) {
		noteUnavailable(output, `el comando de identidad falló: ${error?.message ?? error}`, true);
		return { effective: false, reason: `el comando de identidad falló: ${error?.message ?? error}`, warnOnce: true };
	}
	if (raw === undefined || raw === null) {
		noteUnavailable(output, 'el comando de identidad no respondió a tiempo', true);
		return { effective: false, reason: 'el comando de identidad no respondió a tiempo', warnOnce: true };
	}

	let identity: AlfredIdentity;
	try {
		identity = validateAlfredIdentity(raw);
	} catch (error: any) {
		noteUnavailable(output, `DTO de identidad inválido: ${error?.message ?? error}`, true);
		return { effective: false, reason: `DTO de identidad inválido: ${error?.message ?? error}`, warnOnce: true };
	}

	const ignoredOverrides = detectPlanOverrides(vscode.workspace.getConfiguration('ralph-suite'));
		output?.appendLine(`[Ralph][Alfred] modo efectivo — subagente ${identity.actions.runTask.mention}; el modelo lo elige su ficha`);
	if (ignoredOverrides.length) {
		warnOnce(
			'plan-overrides',
			`Ralph: en modo Alfred se ignoran los overrides de ${ignoredOverrides.join(', ')} que citan /plan/ o plans/. No se ha modificado ningún ajuste.`,
			output,
		);
	}

	return { effective: true, identity, ignoredOverrides };
}

function noteUnavailable(output: vscode.OutputChannel | undefined, reason: string, warnOnceFlag: boolean): void {
	output?.appendLine(`[Ralph][Alfred] modo no disponible: ${reason}`);
	if (warnOnceFlag) {
		warnOnce('mode-unavailable', 'Alfred Dev está instalado pero no anuncia una identidad compatible; Ralph funciona como siempre.', output);
	}
}

// ── Overrides con /plan/ o plans/ (P3) ───────────────────────────────────────

/**
 * Detecta overrides del USUARIO (workspace/global, no los defaults) que citan
 * `/plan/` o `plans/`. Solo se avisa; no se escribe nada.
 */
export function detectPlanOverrides(cfg: vscode.WorkspaceConfiguration): string[] {
	if (typeof (cfg as any).inspect !== 'function') { return []; }
	const affected: string[] = [];
	for (const key of ['guardrails', 'boundaries']) {
		let inspect: { workspaceValue?: unknown; globalValue?: unknown } | undefined;
		try { inspect = (cfg as any).inspect(key); } catch { inspect = undefined; }
		const value = inspect?.workspaceValue ?? inspect?.globalValue;
		if (Array.isArray(value) && value.some(entry => typeof entry === 'string' && PLAN_REFERENCE.test(entry))) {
			affected.push(`ralph-suite.${key}`);
		}
	}
	return affected;
}
