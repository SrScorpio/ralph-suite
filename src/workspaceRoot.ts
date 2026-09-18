import * as fs from 'fs';
import { PrdManager } from './prdManager';

/**
 * Prefers the multi-root folder that contains `prd.json` (honours `prdPath`).
 * Traversal is rejected by PrdManager.prdPath. Falls back to folder[0].
 */
export function resolveWorkspaceRoot(
	folders: readonly string[] | undefined,
	configuredPath = 'prd.json',
	exists: (prdPath: string) => boolean = (prdPath) => fs.existsSync(prdPath),
): string | undefined {
	if (!folders || folders.length === 0) { return undefined; }
	for (const folder of folders) {
		if (exists(PrdManager.prdPath(folder, configuredPath))) { return folder; }
	}
	return folders[0];
}
