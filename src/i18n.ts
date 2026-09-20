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
	emptyNoIssues: string;
	emptyNoIssuesSub: string;
	initProject: string;
	analyzeProject: string;
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

	// Command menu
	menuOpenBoard: string;
	menuAutoRun: string;
	menuStopRunner: string;
	menuRunNext: string;
	menuAddIssue: string;
	menuOpenPrd: string;
	menuMemories: string;
	menuOptimize: string;
	menuSetup: string;
	menuAnalyze: string;
	menuSyncIssue: string;
	menuSettings: string;
	menuPlaceholder: string;
	menuNoPrd: string;
	menuDescBoard: string;
	menuDescAutoRun: string;
	menuDescStopRunner: string;
	menuDescRunNext: string;
	menuDescAddIssue: string;
	menuDescOpenPrd: string;
	menuDescMemories: string;
	menuDescOptimize: string;
	menuDescSetup: string;
	menuInitProject: string;
	menuDescAnalyze: string;
	menuDescInitProject: string;
	menuDescSyncIssue: string;
	menuDescSettings: string;

	// Board columns
	colTodo: string;
	colInProgress: string;
	colDone: string;
	colBlocked: string;
	colFailed: string;
	dropHere: string;

	// Card actions
	run: string;
	refreshContext: string;
	markDone: string;
	addNote: string;
	reset: string;
	blocked: string;
	failed: string;

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
	emptyNoIssues: 'This PRD has no issues',
	emptyNoIssuesSub: 'The PRD exists, but its issues array is empty. Analyze the project or add an issue to populate the board.',
	initProject: 'Start New Project',
	analyzeProject: 'Analyze Existing Project',
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
	menuOpenBoard: 'Open Board',
	menuAutoRun: 'Auto-run',
	menuStopRunner: 'Stop runner',
	menuRunNext: 'Run next task',
	menuAddIssue: 'Add Issue',
	menuOpenPrd: 'Open PRD',
	menuMemories: 'Memories',
	menuOptimize: 'Optimize Memory',
	menuSetup: 'Setup Project',
	menuInitProject: 'Start New Project',
	menuAnalyze: 'Analyze Existing Project',
	menuSyncIssue: 'Sync GitHub issue',
	menuSettings: 'Settings',
	menuPlaceholder: 'Ralph Suite — select a command',
	menuNoPrd: 'No prd.json',
	menuDescBoard: 'Open the Kanban board',
	menuDescAutoRun: 'Start autonomous task loop',
	menuDescStopRunner: 'Stop the current run',
	menuDescRunNext: 'Run the next pending task',
	menuDescAddIssue: 'Add a new issue to prd.json',
	menuDescOpenPrd: 'Open prd.json in editor',
	menuDescMemories: 'Open .agent/memories.md',
	menuDescOptimize: 'Compress and deduplicate memories.md',
	menuDescSetup: 'Generate or regenerate AGENTS.md and docs/',
	menuDescInitProject: 'Describe a goal and generate a PRD',
	menuDescAnalyze: 'Generate a PRD from the current workspace',
	menuDescSyncIssue: 'Sync GitHub issue status to the local task',
	menuDescSettings: 'Configure Ralph Suite',
	colTodo: 'To Do',
	colInProgress: 'In Progress',
	colDone: 'Done',
	colBlocked: 'Blocked',
	colFailed: 'Failed',
	dropHere: 'Drop here',
	run: '▶ Run',
	refreshContext: '🔄 Refresh',
	markDone: '✓ Mark done',
	addNote: '✎',
	reset: '↩ Reset',
	blocked: '⛓ Blocked',
	failed: '⚠ Failed',
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
	emptyNoIssues: 'Este PRD no tiene issues',
	emptyNoIssuesSub: 'El PRD existe, pero su array de issues está vacío. Analiza el proyecto o añade una issue para llenar el tablero.',
	initProject: 'Iniciar proyecto nuevo',
	analyzeProject: 'Analizar proyecto existente',
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
	menuOpenBoard: 'Abrir tablero',
	menuAutoRun: 'Auto-ejecutar',
	menuStopRunner: 'Detener runner',
	menuRunNext: 'Ejecutar siguiente tarea',
	menuAddIssue: 'Añadir issue',
	menuOpenPrd: 'Abrir PRD',
	menuMemories: 'Memorias',
	menuOptimize: 'Optimizar memoria',
	menuSetup: 'Configurar proyecto',
	menuInitProject: 'Iniciar proyecto nuevo',
	menuAnalyze: 'Analizar proyecto existente',
	menuSyncIssue: 'Sincronizar issue GitHub',
	menuSettings: 'Ajustes',
	menuPlaceholder: 'Ralph Suite — elige un comando',
	menuNoPrd: 'Sin prd.json',
	menuDescBoard: 'Abrir el tablero Kanban',
	menuDescAutoRun: 'Iniciar el ciclo autónomo de tareas',
	menuDescStopRunner: 'Detener la ejecución actual',
	menuDescRunNext: 'Ejecutar la siguiente tarea pendiente',
	menuDescAddIssue: 'Añadir un issue nuevo a prd.json',
	menuDescOpenPrd: 'Abrir prd.json en el editor',
	menuDescMemories: 'Abrir .agent/memories.md',
	menuDescOptimize: 'Comprimir y deduplicar memories.md',
	menuDescSetup: 'Generar o regenerar AGENTS.md y docs/',
	menuDescInitProject: 'Describe un objetivo y genera un PRD',
	menuDescAnalyze: 'Generar un PRD desde el workspace actual',
	menuDescSyncIssue: 'Sincronizar el estado de un issue GitHub con la tarea local',
	menuDescSettings: 'Configurar Ralph Suite',
	colTodo: 'Por hacer',
	colInProgress: 'En progreso',
	colDone: 'Completado',
	colBlocked: 'Bloqueado',
	colFailed: 'Fallido',
	dropHere: 'Soltar aquí',
	run: '▶ Ejecutar',
	refreshContext: '🔄 Refrescar',
	markDone: '✓ Marcar hecho',
	addNote: '✎',
	reset: '↩ Reiniciar',
	blocked: '⛓ Bloqueado',
	failed: '⚠ Fallido',
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
