import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateReadingProgress,
  resolveReadingProgressOffset,
} from '../utils/readingProgress.ts';

test('does not retain a position near the start', () => {
  assert.deepEqual(calculateReadingProgress(100, 2000, 500), {
    status: 'at-start',
  });
});

test('retains an unfinished reading position', () => {
  assert.deepEqual(calculateReadingProgress(600, 2000, 500, 123), {
    status: 'active',
    entry: {
      offset: 600,
      fraction: 0.4,
      scrollableDistance: 1500,
      updatedAt: 123,
    },
  });
});

test('treats a position near the end as completed', () => {
  assert.deepEqual(calculateReadingProgress(1450, 2000, 500), {
    status: 'complete',
  });
});

test('uses the exact offset when layout is stable', () => {
  const offset = resolveReadingProgressOffset(
    {
      offset: 600,
      fraction: 0.4,
      scrollableDistance: 1500,
      updatedAt: 123,
    },
    2020,
    500,
  );
  assert.equal(offset, 600);
});

test('uses the relative position after a material layout change', () => {
  const offset = resolveReadingProgressOffset(
    {
      offset: 600,
      fraction: 0.4,
      scrollableDistance: 1500,
      updatedAt: 123,
    },
    2500,
    500,
  );
  assert.equal(offset, 800);
});

test('supports legacy entries that only contain an offset', () => {
  const offset = resolveReadingProgressOffset(
    { offset: 600, updatedAt: 123 },
    2500,
    500,
  );
  assert.equal(offset, 600);
});
