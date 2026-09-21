import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const policySource = await readFile(
  new URL('../imagePolicy.ts', import.meta.url),
  'utf8',
);
const { outputText: policyJavaScript } = ts.transpileModule(policySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { DAILY_AVATAR_SIZE, hasHtmlClass, isDailyAvatar } = await import(
  `data:text/javascript;base64,${Buffer.from(policyJavaScript).toString('base64')}`
);

test('matches complete HTML class names', () => {
  assert.equal(hasHtmlClass('avatar featured', 'avatar'), true);
  assert.equal(hasHtmlClass('avatar-large', 'avatar'), false);
  assert.equal(hasHtmlClass(undefined, 'avatar'), false);
});

test('only treats avatar images in daily content as compact avatars', () => {
  assert.equal(DAILY_AVATAR_SIZE, 40);
  assert.equal(isDailyAvatar({ class: 'avatar' }, 'daily'), true);
  assert.equal(isDailyAvatar({ class: 'content-image' }, 'daily'), false);
  assert.equal(isDailyAvatar({ class: 'avatar' }, 'default'), false);
});
