import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getBoardContent } from '../webview/kanbanHtml';
import { t } from '../i18n';
import { buildAnalyzeExistingProjectPrompt } from '../kanban/analyzeProject';
import { defaultBoardScope, listRalphFolders, resolveFolderIndex } from '../workspaceFolders';

describe('workspace folders and analyze prompt', () => {
  it('lists each folder and whether it has a PRD', () => {
    const first = path.join(os.tmpdir(), 'ralph-ws-a');
    const second = path.join(os.tmpdir(), 'ralph-ws-b');
    const prd = path.join(second, 'docs', 'ralph', 'prd.json');
    const folders = listRalphFolders([first, second], 'docs/ralph/prd.json', (candidate) => candidate === prd);
    assert.strictEqual(folders.length, 2);
    assert.strictEqual(folders[0].hasPrd, false);
    assert.strictEqual(folders[1].hasPrd, true);
    assert.strictEqual(folders[1].index, 1);
  });

  it('defaults to workspace scope only when there are multiple folders', () => {
    assert.strictEqual(defaultBoardScope(1), 'folder');
    assert.strictEqual(defaultBoardScope(2), 'workspace');
  });

  it('rejects folder indexes outside the allowlist', () => {
    assert.strictEqual(resolveFolderIndex(0, 2), 0);
    assert.strictEqual(resolveFolderIndex(2, 2), null);
    assert.strictEqual(resolveFolderIndex('0', 2), null);
    assert.strictEqual(resolveFolderIndex(-1, 2), null);
  });

  it('builds an analyze prompt that does not invent or overwrite silently', () => {
    const prompt = buildAnalyzeExistingProjectPrompt(['C:/proj/a', 'C:/proj/b']);
    assert.ok(prompt.includes('C:/proj/a'));
    assert.ok(prompt.includes('Do NOT modify prd.json if it already exists'));
    assert.ok(prompt.includes('Definir el siguiente requerimiento'));
    assert.ok(prompt.includes('never invent chat history'));
  });

  it('empty state offers new project, import, and analyze actions', () => {
    const en = t('en');
    const es = t('es');
    assert.ok(en.initProject.toLowerCase().includes('new'));
    assert.ok(es.initProject.toLowerCase().includes('nuevo'));
    assert.ok(en.analyzeProject.toLowerCase().includes('analyze'));
    assert.ok(es.analyzeProject.toLowerCase().includes('analiz'));
    const html = getBoardContent(null, null, {}, { autoRun: false, maxLoops: 1, guardrails: [], boundaries: [], view: 'board' });
    assert.ok(html.includes('data-action="initProject"'));
    assert.ok(html.includes('data-action="importPlan"'));
    assert.ok(html.includes('data-action="analyzeProject"'));
  });
});
