import * as fs from 'fs';
import { DEFAULT_PRD_PATH, PrdManager } from './prdManager';

/**
 * Prefers the multi-root folder that has a resolvable PRD (docs/ralph/prd.json
 * or legacy root prd.json). Honours `prdPath`. Traversal is rejected by
 * PrdManager.prdPath. Returns undefined when no folder is allowlisted by its PRD.
 */
export function resolveWorkspaceRoot(
	folders: readonly string[] | undefined,
	configuredPath = DEFAULT_PRD_PATH,
	exists: (prdPath: string) => boolean = (prdPath) => fs.existsSync(prdPath),
): string | undefined {
	if (!folders || folders.length === 0) { return undefined; }
	for (const folder of folders) {
		if (exists(PrdManager.prdPath(folder, configuredPath, exists))) { return folder; }
	}
	return undefined;
}
