/**
 * healthScore.ts — Project health score (ADR-005)
 *
 * Calculates a 0-100 health score from existing runtime logs in .ralph/.
 * No new data needed — reuses task-*-log.json. Higher = healthier.
 *
 * Factors:
 *  - Completion rate: completed / total tasks
 *  - Success rate: completed / (completed + failed)
 *  - Throughput: tasks completed recently (last 7 days) — rewards activity
 *  - Blocker penalty: blocked tasks reduce score
 */

import { TaskLog } from './stateManager';
import { Prd } from './prdManager';

export interface HealthScore {
	score: number;          // 0-100, rounded
	label: 'Excellent' | 'Good' | 'Fair' | 'At risk' | 'Critical';
	color: string;          // CSS color
	breakdown: {
		completion: number;   // 0-100 contribution
		successRate: number;  // 0-100 contribution
		throughput: number;   // 0-100 contribution
		blockerPenalty: number; // negative contribution (0 = no penalty)
	};
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute the project health score.
 *
 * @param prd the project backlog
 * @param statuses map of taskId → status (from .ralph/task-*-status)
 * @param logs array of task logs (from .ralph/task-*-log.json)
 */
export function computeHealthScore(
	prd: Prd,
	statuses: Record<string, string>,
	logs: TaskLog[]
): HealthScore {
	const total = prd.issues.length;
	if (total === 0) {
		return {
			score: 100,
			label: 'Excellent',
			color: '#3fb950',
			breakdown: { completion: 50, successRate: 25, throughput: 25, blockerPenalty: 0 },
		};
	}

	// Count statuses
	const statusCount = { todo: 0, inprogress: 0, completed: 0, blocked: 0 };
	for (const issue of prd.issues) {
		const s = statuses[issue.id] ?? 'todo';
		if (s in statusCount) { (statusCount as any)[s]++; }
	}

	// Completion rate (weight: 50%)
	const completion = Math.round((statusCount.completed / total) * 100);
	const completionContribution = Math.round((completion / 100) * 50);

	// Success rate (weight: 25%) — completed vs failed in logs
	const failed = logs.filter(l => l.status === 'failed').length;
	const completedInLogs = logs.filter(l => l.status === 'completed').length;
	const attempted = completedInLogs + failed;
	const successPct = attempted > 0 ? (completedInLogs / attempted) * 100 : 100;
	const successContribution = Math.round((successPct / 100) * 25);

	// Throughput (weight: 25%) — tasks completed in last 7 days
	const now = Date.now();
	const recentCompleted = logs.filter(l =>
		l.status === 'completed' &&
		l.completedAt &&
		(now - new Date(l.completedAt).getTime()) < SEVEN_DAYS_MS
	).length;
	// Normalize: 1+ recent task = full throughput credit
	const throughputPct = Math.min(100, recentCompleted * 25);
	const throughputContribution = Math.round((throughputPct / 100) * 25);

	// Blocker penalty: each blocked task reduces score by up to 5 points
	const blockerPenalty = Math.min(30, statusCount.blocked * 5);

	const raw = completionContribution + successContribution + throughputContribution - blockerPenalty;
	const score = Math.max(0, Math.min(100, raw));

	let label: HealthScore['label'];
	let color: string;
	if (score >= 80) { label = 'Excellent'; color = '#3fb950'; }
	else if (score >= 60) { label = 'Good'; color = '#58a6ff'; }
	else if (score >= 40) { label = 'Fair'; color = '#e3b341'; }
	else if (score >= 20) { label = 'At risk'; color = '#db6d28'; }
	else { label = 'Critical'; color = '#f85149'; }

	return {
		score,
		label,
		color,
		breakdown: {
			completion: completionContribution,
			successRate: successContribution,
			throughput: throughputContribution,
			blockerPenalty: -blockerPenalty,
		},
	};
}
