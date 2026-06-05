import * as fs from 'fs';
import * as path from 'path';
import { RalphStateManager, safeTaskId } from './stateManager';

export interface Issue {
	id: string;
	title: string;
	description: string;
	epic?: string;
	priority: 'P0' | 'P1' | 'P2' | 'P3';
	status: 'todo' | 'inprogress' | 'completed' | 'blocked';
	acceptanceCriteria: string[];
	dependencies: string[];
	labels: string[];
}

export interface Prd {
	project: string;
	description: string;
	version: string;
	issues: Issue[];
}

interface RawItem {
	id: string;
	title: string;
	description?: string;
	acceptanceCriteria?: string[];
	priority?: number | string;
	epic?: string;
	labels?: string[];
	dependencies?: string[];
	status?: string;
}

interface RawPrd {
	project?: string;
	description?: string;
	version?: string;
	issues?: RawItem[];
	userStories?: RawItem[];
}

function normalizePriority(raw: number | string | undefined): 'P0' | 'P1' | 'P2' | 'P3' {
	if (raw === undefined) return 'P2';
	if (typeof raw === 'number') {
		if (raw <= 2)  return 'P0';
		if (raw <= 6)  return 'P1';
		if (raw <= 14) return 'P2';
		return 'P3';
	}
	const s = String(raw).toUpperCase().trim();
	if (s === 'P0' || s === 'CRITICAL' || s === 'BLOCKER') return 'P0';
	if (s === 'P1' || s === 'HIGH')   return 'P1';
	if (s === 'P2' || s === 'MEDIUM') return 'P2';
	if (s === 'P3' || s === 'LOW')    return 'P3';
	return 'P2';
}

function normalizeStatus(raw: string | undefined): Issue['status'] {
	const s = (raw ?? 'todo').toLowerCase().trim();
	if (s === 'inprogress' || s === 'in_progress' || s === 'in-progress') { return 'inprogress'; }
	if (s === 'completed'  || s === 'done')  { return 'completed'; }
	if (s === 'blocked')   { return 'blocked'; }
	return 'todo';
}

function asString(raw: unknown, fallback = ''): string {
	return typeof raw === 'string' ? raw.trim() : fallback;
}

function asStringArray(raw: unknown): string[] {
	if (!Array.isArray(raw)) { return []; }
	return raw
		.filter((v): v is string => typeof v === 'string')
		.map(v => v.trim())
		.filter(Boolean)
		.slice(0, 100);
}

function uniqueId(rawId: unknown, index: number, usedIds: Set<string>): string {
	const base = safeTaskId(asString(rawId, `ISSUE-${String(index + 1).padStart(3, '0')}`));
	let id = base;
	let n = 2;
	while (usedIds.has(id)) {
		id = `${base}-${n}`;
		n++;
	}
	usedIds.add(id);
	return id;
}

function normalizeItem(raw: RawItem, index: number, usedIds: Set<string>): Issue {
	return {
		id:                 uniqueId(raw.id, index, usedIds),
		title:              asString(raw.title, 'Untitled task').slice(0, 240),
		description:        asString(raw.description).slice(0, 4000),
		epic:               raw.epic ? asString(raw.epic).slice(0, 120) : undefined,
		priority:           normalizePriority(raw.priority),
		status:             normalizeStatus(raw.status),
		acceptanceCriteria: asStringArray(raw.acceptanceCriteria),
		dependencies:       asStringArray(raw.dependencies).map(safeTaskId),
		labels:             asStringArray(raw.labels).map(l => l.slice(0, 80)),
	};
}

export class PrdManager {
	static load(root: string): Prd | null {
		const prdPath = path.join(root, 'prd.json');
		if (!fs.existsSync(prdPath)) return null;
		try {
			const raw = JSON.parse(fs.readFileSync(prdPath, 'utf-8')) as RawPrd;
			const rawItems: RawItem[] = Array.isArray(raw.issues)
				? raw.issues
				: Array.isArray(raw.userStories) ? raw.userStories : [];
			const usedIds = new Set<string>();
			const issues: Issue[] = rawItems
				.filter((item): item is RawItem => !!item && typeof item === 'object')
				.map((item, index) => normalizeItem(item, index, usedIds));
			const prd: Prd = {
				project:     asString(raw.project, 'Unnamed Project').slice(0, 160),
				description: asString(raw.description).slice(0, 2000),
				version:     asString(raw.version, '1.0.0').slice(0, 40),
				issues,
			};
			const statuses = RalphStateManager.getAllStatuses(root);
			for (const issue of prd.issues) {
				if (statuses[issue.id]) {
					issue.status = statuses[issue.id];
				}
				if (issue.status === 'todo' && issue.dependencies.length > 0) {
					const blocked = issue.dependencies.some(dep =>
						(statuses[dep] ?? 'todo') !== 'completed'
					);
					if (blocked) { issue.status = 'blocked'; }
				}
			}
			return prd;
		} catch (e) {
			console.error('[Ralph] Failed to parse prd.json:', e);
			return null;
		}
	}

	static nextPending(prd: Prd, _root: string): Issue | null {
		const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
		return prd.issues
			.filter(i => i.status === 'todo')
			.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9))[0] ?? null;
	}

	static stats(prd: Prd) {
		const total = prd.issues.length;
		const byStatus = { todo: 0, inprogress: 0, completed: 0, blocked: 0 };
		for (const i of prd.issues) { byStatus[i.status] = (byStatus[i.status] ?? 0) + 1; }
		const byEpic: Record<string, number> = {};
		for (const i of prd.issues) { const e = i.epic || 'General'; byEpic[e] = (byEpic[e] ?? 0) + 1; }
		return { total, ...byStatus, byEpic };
	}
}
