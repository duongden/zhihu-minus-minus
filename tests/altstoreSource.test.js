const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('AltStore source metadata and embedded permissions match the built IPA', () => {
  const result = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['-B', path.join(__dirname, 'altstore_source_test.py')],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  expect(result.stderr).toContain('OK');
  expect(result.status).toBe(0);
});
