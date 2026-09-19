import { DEFAULT_PRD_PATH, PrdManager } from '../prdManager';
import { RalphStateManager } from '../stateManager';

export type RalphSyncStatus = 'todo' | 'inprogress' | 'blocked' | 'completed';

const RALPH_SYNC_STATUSES: readonly RalphSyncStatus[] = ['todo', 'inprogress', 'blocked', 'completed'];

function isRalphSyncStatus(value: unknown): value is RalphSyncStatus {
	return typeof value === 'string' && RALPH_SYNC_STATUSES.includes(value as RalphSyncStatus);
}

function isGitHubIssueNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999999;
}

function labelMatchesIssue(label: string, issueNumber: number): boolean {
	return label === `github:#${issueNumber}` || new RegExp(`^[^/:\\s]+/[^/\\s]+#${issueNumber}$`).test(label);
}

export function syncIssue(
	githubIssueNumber: unknown,
	status: unknown,
	workspaceRoot?: string,
	configuredPrdPath = DEFAULT_PRD_PATH,
): void {
	if (!isGitHubIssueNumber(githubIssueNumber)) {
		throw new Error('Número de issue GitHub inválido: debe ser un entero entre 1 y 999999.');
	}
	if (!isRalphSyncStatus(status)) {
		throw new Error('Estado Ralph inválido: debe ser todo, inprogress, blocked o completed.');
	}
	if (!workspaceRoot) {
		throw new Error('No hay un workspace Ralph disponible.');
	}

	const prd = PrdManager.load(workspaceRoot, configuredPrdPath);
	if (!prd) {
		throw new Error('No se encontró el PRD de Ralph en el workspace.');
	}
	const matches = prd.issues.filter(issue => issue.labels.some(label => labelMatchesIssue(label, githubIssueNumber)));
	if (matches.length === 0) {
		throw new Error(`No se encontró una tarea Ralph mapeada a GitHub issue #${githubIssueNumber}.`);
	}
	if (matches.length > 1) {
		throw new Error(`Hay ${matches.length} tareas Ralph mapeadas a GitHub issue #${githubIssueNumber}; el mapeo debe ser único.`);
	}

	const issue = matches[0];
	switch (status) {
		case 'todo':
			RalphStateManager.reset(workspaceRoot, issue.id);
			return;
		case 'inprogress':
			RalphStateManager.setStatus(workspaceRoot, issue.id, 'inprogress', issue.title);
			return;
		case 'blocked':
			RalphStateManager.setStatus(workspaceRoot, issue.id, 'blocked');
			return;
		case 'completed':
			RalphStateManager.setCompleted(workspaceRoot, issue.id);
			return;
	}
}