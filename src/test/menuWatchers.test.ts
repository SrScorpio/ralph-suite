import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { prdDisplayPath } from '../commands/project';

const testDirectory = typeof __dirname === 'string'
  ? __dirname
  : path.join(process.cwd(), 'src', 'test');

function readSource(...segments: string[]): string {
  const __dirname = testDirectory;
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');
}

describe('menu, project and watcher source contracts', () => {
  it('uses stable menu ids and localized analyze text', () => {
    const source = readSource('commands', 'menu.ts');
    const i18n = readSource('i18n.ts');
    assert.ok(source.includes('ralph-suite.analyzeProject'));
    assert.ok(source.includes('pick.id'));
    assert.ok(source.includes('id:'));
    assert.ok(!source.includes("'$(search)  Analyze Existing Project':"));
    assert.ok(i18n.includes("menuAnalyze: 'Analizar proyecto existente'"));
    assert.ok(i18n.includes("menuInitProject: 'Start New Project'"));
    assert.ok(i18n.includes("menuInitProject: 'Iniciar proyecto nuevo'"));
    assert.ok(i18n.includes("menuDescInitProject: 'Describe a goal and generate a PRD'"));
    assert.ok(i18n.includes("menuDescInitProject: 'Describe un objetivo y genera un PRD'"));
    assert.ok(source.includes("analyze: 'ralph-suite.analyzeProject'"));
    assert.ok(source.includes("initProject: 'ralph-suite.initProject'"));
    assert.ok(source.includes("syncIssue: 'ralph-suite.syncIssue'"));
  });

  it('uses the new project title and does not retain the old init title', () => {
    const source = readSource('commands', 'project.ts');
    assert.ok(source.includes('Ralph Suite — Start New Project'));
    assert.ok(!source.includes('title: \'Init Project\''));
  });

  it('formats the configured PRD path relative to the workspace', () => {
    assert.strictEqual(
      prdDisplayPath('C:/workspace', 'C:/workspace/docs/ralph/prd.json'),
      'docs/ralph/prd.json',
    );
    assert.strictEqual(prdDisplayPath('', ''), 'prd.json');
  });

  it('watches task status and note files for every Ralph folder', () => {
    const source = readSource('kanbanPanel.ts');
    assert.ok(source.includes('for (const folder of folders)'));
    assert.ok(source.includes('.ralph/task-*-status'));
    assert.ok(source.includes('.ralph/task-*-note'));
  });
});