const { spawnSync } = require('child_process');

const mochaCommand = require.resolve('mocha/bin/mocha.js');
const mochaArgs = [
  '--require', 'ts-node/register',
  '--require', './src/test/vscodeMock.js',
  'src/test/**/*.test.ts',
  '--timeout', '10000',
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, [mochaCommand, ...mochaArgs], {
  stdio: 'inherit',
  env: { ...process.env, NODE_NO_WARNINGS: '1' },
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status === null ? 1 : result.status);
