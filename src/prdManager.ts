import * as fs from 'fs';
import * as path from 'path';
import { RalphStateManager, safeTaskId } from './stateManager';

export const DEFAULT_PRD_PATH = 'docs/ralph/prd.json';
export const LEGACY_PRD_PATH = 'prd.json';

export function isDefaultPrdPathSetting(configuredPath?: string): boolean {
	const normalized = (configuredPath ?? '').trim().replace(/\\/g, '/');
	return normalized === '' || normalized === DEFAULT_PRD_PATH;
}

/**
 * Relative glob for vscode.RelativePattern. Always uses `/` because
 * path.relative() on Windows yields backslashes that VS Code globs reject.
 */
export function prdWatchPattern(root: string, configuredPath = DEFAULT_PRD_PATH): string {
	const relative = path.relative(root, PrdManager.prdPath(root, configuredPath)) || DEFAULT_PRD_PATH;
	return relative.replace(/\\/g, '/');
}

export interface Issue {
	id: string;
	title: string;
	description: string;
	epic?: string;
	priority: 'P0' | 'P1' | 'P2' | 'P3';
	status: 'todo' | 'inprogress' | 'completed' | 'blocked' | 'failed';
	acceptanceCriteria: string[];
	dependencies: string[];
	labels: string[];
	folderIndex?: number;
	folderName?: string;
}

export interface Prd {
	project: string;
	description: string;
	version: string;
	issues: Issue[];
}

interface RawItem {
	id: unknown;
	title?: unknown;
	description?: string;
	acceptanceCriteria?: string[];
	acceptance?: string[];
	priority?: number | string;
	epic?: string;
	phase?: string;
	labels?: string[];
	dependencies?: string[];
	status?: string;
}

interface RawPrd {
	project?: string;
	projectName?: string;
	description?: string;
	story?: string;
	version?: string;
	issues?: RawItem[];
	userStories?: RawItem[];
	tasks?: RawItem[];
	items?: RawItem[];
	stories?: RawItem[];
}

const RECOGNIZED_ITEM_KEYS = ['issues', 'userStories', 'tasks', 'items', 'stories'] as const;

function recognizedItems(raw: any): any[] | null {
	for (const key of RECOGNIZED_ITEM_KEYS) {
		if (Array.isArray(raw?.[key])) { return raw[key]; }
	}
	return null;
}

export function countRecognizedItems(raw: unknown): number {
	return recognizedItems(raw)?.length ?? 0;
}

function readJsonFile(filePath: string): any | null {
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
	} catch {
		return null;
	}
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
	if (s === 'failed')    { return 'failed'; }
	return 'todo';
}

function asString(raw: unknown, fallback = ''): string {
	if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
		return String(raw).trim();
	}
	return fallback;
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
	const description = asString(raw.description);
	const title = asString(raw.title, description.split(/\r?\n/, 1)[0] || 'Untitled task');
	const acceptanceCriteria = asStringArray(raw.acceptanceCriteria);
	return {
		id:                 uniqueId(raw.id, index, usedIds),
		title:              title.slice(0, 240),
		description:        description.slice(0, 4000),
		epic:               asString(raw.epic, asString(raw.phase)).slice(0, 120) || undefined,
		priority:           normalizePriority(raw.priority),
		status:             normalizeStatus(raw.status),
		acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : asStringArray(raw.acceptance),
		dependencies:       asStringArray(raw.dependencies).map(safeTaskId),
		labels:             asStringArray(raw.labels).map(l => l.slice(0, 80)),
	};
}

export class PrdManager {
	static prdPath(
		root: string,
		configuredPath = DEFAULT_PRD_PATH,
		exists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate),
	): string {
		const rootPath = path.resolve(root);
		const safeFallback = path.join(rootPath, DEFAULT_PRD_PATH);
		if (isDefaultPrdPathSetting(configuredPath)) {
			const modern = path.join(rootPath, DEFAULT_PRD_PATH);
			const legacy = path.join(rootPath, LEGACY_PRD_PATH);
			if (exists(modern)) {
				if (fs.existsSync(modern)) {
					const modernRaw = readJsonFile(modern);
					if (modernRaw === null) { return modern; }
					if (countRecognizedItems(modernRaw) === 0 && exists(legacy) && fs.existsSync(legacy)) {
						const legacyRaw = readJsonFile(legacy);
						if (legacyRaw !== null && countRecognizedItems(legacyRaw) > 0) { return legacy; }
					}
				}
				return modern;
			}
			if (exists(legacy)) { return legacy; }
			return modern;
		}
		const target = path.isAbsolute(configuredPath)
			? configuredPath
			: path.join(rootPath, configuredPath);
		const resolved = path.resolve(target);
		if (resolved !== rootPath && !resolved.startsWith(rootPath + path.sep)) {
			return safeFallback;
		}
		return resolved;
	}

	static rawItems(raw: any): any[] {
		const items = recognizedItems(raw);
		if (items) { return items; }
		raw.issues = [];
		return raw.issues;
	}

	static setRawItems(raw: any, items: any[]): void {
		for (const key of RECOGNIZED_ITEM_KEYS) {
			if (Array.isArray(raw?.[key])) { raw[key] = items; return; }
		}
		raw.issues = items;
	}

	static loadRaw(root: string, configuredPath = DEFAULT_PRD_PATH): any | null {
		const prdPath = this.prdPath(root, configuredPath);
		if (!fs.existsSync(prdPath)) { return null; }
		try {
			return JSON.parse(fs.readFileSync(prdPath, 'utf-8'));
		} catch (e) {
			console.error('[Ralph] Failed to parse prd.json:', e);
			return null;
		}
	}

	static saveRaw(root: string, raw: any, configuredPath = DEFAULT_PRD_PATH): void {
		const prdPath = this.prdPath(root, configuredPath);
		const dir = path.dirname(prdPath);
		if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
		const tmpPath = path.join(dir, `.prd.json.${process.pid}.${Date.now()}.tmp`);
		fs.writeFileSync(tmpPath, JSON.stringify(raw, null, 2), 'utf-8');
		fs.renameSync(tmpPath, prdPath);
	}

	static mutateRaw(root: string, mutate: (raw: any, items: any[]) => boolean | void, configuredPath = DEFAULT_PRD_PATH): boolean {
		const raw = this.loadRaw(root, configuredPath);
		if (!raw) { return false; }
		const items = this.rawItems(raw);
		const changed = mutate(raw, items);
		if (changed === false) { return false; }
		this.setRawItems(raw, items);
		this.saveRaw(root, raw, configuredPath);
		return true;
	}

	static load(root: string, configuredPath = DEFAULT_PRD_PATH): Prd | null {
		const prdPath = this.prdPath(root, configuredPath);
		if (!fs.existsSync(prdPath)) { return null; }
		try {
			const raw = this.loadRaw(root, configuredPath) as RawPrd | null;
			if (!raw) { return null; }
			const rawItems: RawItem[] = recognizedItems(raw) ?? [];
			const usedIds = new Set<string>();
			const issues: Issue[] = rawItems
				.filter((item): item is RawItem => !!item && typeof item === 'object')
				.map((item, index) => normalizeItem(item, index, usedIds));
			const prd: Prd = {
				project:     asString(raw.project, asString(raw.projectName, 'Unnamed Project')).slice(0, 160),
				description: asString(raw.description, asString(raw.story)).slice(0, 2000),
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
						statuses[dep] !== 'completed'
						&& prd.issues.find(candidate => candidate.id === dep)?.status !== 'completed'
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
		const byStatus = { todo: 0, inprogress: 0, completed: 0, blocked: 0, failed: 0 };
		for (const i of prd.issues) { byStatus[i.status] = (byStatus[i.status] ?? 0) + 1; }
		const byEpic: Record<string, number> = {};
		for (const i of prd.issues) { const e = i.epic || 'General'; byEpic[e] = (byEpic[e] ?? 0) + 1; }
		return { total, ...byStatus, byEpic };
	}
}
