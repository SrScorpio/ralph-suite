import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PRD_PATH, PrdManager } from './prdManager';

export interface RalphFolder {
  index: number;
  root: string;
  name: string;
  prdPath: string;
  hasPrd: boolean;
}

export type BoardScope = 'folder' | 'workspace';

export function listRalphFolders(
  folders: readonly string[] | undefined,
  configuredPath = DEFAULT_PRD_PATH,
  exists: (prdPath: string) => boolean = (prdPath) => fs.existsSync(prdPath),
): RalphFolder[] {
  if (!folders?.length) { return []; }
  return folders.map((root, index) => {
    const prdPath = PrdManager.prdPath(root, configuredPath, exists);
    return {
      index,
      root,
      name: path.basename(root) || ('folder-' + index),
      prdPath,
      hasPrd: exists(prdPath),
    };
  });
}

export function defaultBoardScope(folderCount: number): BoardScope {
  return folderCount > 1 ? 'workspace' : 'folder';
}

export function resolveFolderIndex(raw: unknown, folderCount: number): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= folderCount) {
    return null;
  }
  return raw;
}
