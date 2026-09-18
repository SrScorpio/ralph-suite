/**
 * i18n.ts — Internationalization for the webview UI.
 *
 * VS Code's package.nls.*.json handles settings/commands localization,
 * but the webview runs client-side and needs its own string catalog.
 *
 * The active locale is detected from the VS Code config (locale setting)
 * and passed into the webview via getShellHtml(). New languages are added
 * by extending the `translations` map below.
 *
 * Supported: en, es. To add a language, copy the `en` block and translate.
 */

export type Locale = 'en' | 'es';

import * as vscode from 'vscode';

export interface UIStrings {
	// Empty state
	emptyNoPrd: string;
	emptyNoPrdSub: string;
	initProject: string;
	importPlan: string;
	emptyHint: string;

	// Stats bar
	board: string;
	epic: string;
	history: string;
	stop: string;
	autoRun: string;
	pushGithub: string;
	syncGithub: string;
	addIssue: string;
	addChat: string;
	openPrd: string;
	openMemory: string;
	optimize: string;
	plan: string;
	agents: string;
	settings: string;
	refresh: string;

	// Board columns
	colTodo: string;
	colInProgress: string;
	colDone: string;
	colBlocked: string;
	dropHere: string;

	// Card actions
	run: string;
	refreshContext: string;
	markDone: string;
	addNote: string;
	reset: string;
	blocked: string;

	// Modals
	newIssue: string;
	editIssue: string;
	title: string;
	description: string;
	epicLabel: string;
	priority: string;
	acceptanceCriteria: string;
	labels: string;
	dependencies: string;
	cancel: string;
	save: string;

	// History view
	noCompleted: string;
	colId: string;
	colTitle: string;
	colDuration: string;
	colDate: string;
	colNote: string;

	// Health labels
	healthExcellent: string;
	healthGood: string;
	healthFair: string;
	healthAtRisk: string;
	healthCritical: string;
}

const en: UIStrings = {
	emptyNoPrd: 'No prd.json found',
	emptyNoPrdSub: 'Generate one from a project description or import a Plan.',
	initProject: 'Init Project',
	importPlan: '⬇ Import Plan',
	emptyHint: 'Or place a <code>prd.json</code> at <code>docs/ralph/prd.json</code> (legacy root <code>prd.json</code> still works)',
	board: '⊞ Board',
	epic: '⬡ Epic',
	history: '📋 History',
	stop: '⏹ Stop',
	autoRun: '⚡ Auto-run',
	pushGithub: '⬆ GitHub',
	syncGithub: '⬇ Sync',
	addIssue: '＋ Issue',
	addChat: '＋ Chat',
	openPrd: '📄 PRD',
	openMemory: '🧠 Memory',
	optimize: '🧹 Optimize',
	plan: '⬇ Plan',
	agents: '⚙ Agents',
	settings: '⚙',
	refresh: '↻',
	colTodo: 'To Do',
	colInProgress: 'In Progress',
	colDone: 'Done',
	colBlocked: 'Blocked',
	dropHere: 'Drop here',
	run: '▶ Run',
	refreshContext: '🔄 Refresh',
	markDone: '✓ Mark done',
	addNote: '✎',
	reset: '↩ Reset',
	blocked: '⛓ Blocked',
	newIssue: '＋ New Issue',
	editIssue: '✎ Edit Issue',
	title: 'Title',
	description: 'Description',
	epicLabel: 'Epic',
	priority: 'Priority',
	acceptanceCriteria: 'Acceptance Criteria (one per line)',
	labels: 'Labels (comma-separated)',
	dependencies: 'Dependencies (comma-separated IDs)',
	cancel: 'Cancel',
	save: 'Save',
	noCompleted: 'No completed tasks yet',
	colId: 'ID',
	colTitle: 'Title',
	colDuration: 'Duration',
	colDate: 'Date',
	colNote: 'Note',
	healthExcellent: 'Excellent',
	healthGood: 'Good',
	healthFair: 'Fair',
	healthAtRisk: 'At risk',
	healthCritical: 'Critical',
};

const es: UIStrings = {
	emptyNoPrd: 'No se encontró prd.json',
	emptyNoPrdSub: 'Genera uno desde una descripción de proyecto o importa un Plan.',
	initProject: 'Iniciar Proyecto',
	importPlan: '⬇ Importar Plan',
	emptyHint: 'O coloca un <code>prd.json</code> en <code>docs/ralph/prd.json</code> (el <code>prd.json</code> legado en la raíz sigue valiendo)',
	board: '⊞ Tablero',
	epic: '⬡ Épicas',
	history: '📋 Historial',
	stop: '⏹ Detener',
	autoRun: '⚡ Auto-ejecutar',
	pushGithub: '⬆ GitHub',
	syncGithub: '⬇ Sincronizar',
	addIssue: '＋ Issue',
	addChat: '＋ Chat',
	openPrd: '📄 PRD',
	openMemory: '🧠 Memoria',
	optimize: '🧹 Optimizar',
	plan: '⬇ Plan',
	agents: '⚙ Agents',
	settings: '⚙',
	refresh: '↻',
	colTodo: 'Por hacer',
	colInProgress: 'En progreso',
	colDone: 'Completado',
	colBlocked: 'Bloqueado',
	dropHere: 'Soltar aquí',
	run: '▶ Ejecutar',
	refreshContext: '🔄 Refrescar',
	markDone: '✓ Marcar hecho',
	addNote: '✎',
	reset: '↩ Reiniciar',
	blocked: '⛓ Bloqueado',
	newIssue: '＋ Nuevo Issue',
	editIssue: '✎ Editar Issue',
	title: 'Título',
	description: 'Descripción',
	epicLabel: 'Épica',
	priority: 'Prioridad',
	acceptanceCriteria: 'Criterios de aceptación (uno por línea)',
	labels: 'Etiquetas (separadas por coma)',
	dependencies: 'Dependencias (IDs separados por coma)',
	cancel: 'Cancelar',
	save: 'Guardar',
	noCompleted: 'Aún no hay tareas completadas',
	colId: 'ID',
	colTitle: 'Título',
	colDuration: 'Duración',
	colDate: 'Fecha',
	colNote: 'Nota',
	healthExcellent: 'Excelente',
	healthGood: 'Bien',
	healthFair: 'Regular',
	healthAtRisk: 'En riesgo',
	healthCritical: 'Crítico',
};

const translations: Record<Locale, UIStrings> = { en, es };

/**
 * Detect the active locale from the VS Code environment.
 * Falls back to 'en' for any unrecognized language.
 */
export function detectLocale(): Locale {
	// vscode.env.language is the documented property (e.g. 'es', 'en', 'es-es')
	const raw = (vscode.env as { language?: string }).language ?? 'en';
	const lang = String(raw).toLowerCase();
	if (lang.startsWith('es')) { return 'es'; }
	return 'en';
}

/**
 * Get the translated strings for the given locale.
 */
export function t(locale: Locale): UIStrings {
	return translations[locale] ?? translations.en;
}
