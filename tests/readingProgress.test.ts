import assert from 'node:assert/strict';
import { act, renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useProgressStore } from '../store/useProgressStore';
import {
  calculateReadingProgress,
  resolveReadingProgressOffset,
} from '../utils/readingProgress';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

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

describe('reading position while Native V2 stages its first layout', () => {
  const contentKey = 'answer:layout-regression';
  const savedEntry = {
    offset: 1200,
    fraction: 0.4,
    scrollableDistance: 3000,
    updatedAt: 123,
  };
  const viewport = {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 800 } },
  } as LayoutChangeEvent;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(useProgressStore.persist, 'hasHydrated').mockReturnValue(true);
    useProgressStore.setState({ progress: { [contentKey]: savedEntry } });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('preserves a saved position through a slow short placeholder and restores from the revealed body', async () => {
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({ contentKey, ready, scrollRef }),
      { initialProps: { ready: false } },
    );
    await act(() => {
      result.current.onLayout(viewport);
      // Cached answer data is available, but its 200px native placeholder plus
      // header/footer is shorter than the viewport for more than 180ms.
      result.current.onContentSizeChange(320, 480);
      jest.advanceTimersByTime(1000);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(result.current.restoredOffset).toBeNull();
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );

    await rerender({ ready: true });
    await act(() => jest.advanceTimersByTime(200));
    // Readiness alone cannot consume the previously measured placeholder.
    expect(scrollTo).not.toHaveBeenCalled();
    await act(() => {
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
    expect(result.current.restoredOffset).toBe(1200);
  });

  it('cancels an old restore timer and requires a new measurement after readiness is revoked', async () => {
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({ contentKey, ready, scrollRef }),
      { initialProps: { ready: true } },
    );
    await act(() => {
      result.current.onLayout(viewport);
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(100);
    });
    await rerender({ ready: false });
    await act(() => {
      result.current.onContentSizeChange(320, 480);
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    await rerender({ ready: true });
    await act(() => jest.advanceTimersByTime(200));
    expect(scrollTo).not.toHaveBeenCalled();
    await act(() => {
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(180);
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1200, animated: false });
  });

  it('never scrolls on the first load when no saved position exists', async () => {
    useProgressStore.setState({ progress: {} });
    const scrollTo = jest.fn();
    const scrollRef = { current: { scrollTo } };
    const { result, rerender } = await renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({ contentKey, ready, scrollRef }),
      { initialProps: { ready: false } },
    );
    await act(() => {
      result.current.onLayout(viewport);
      result.current.onContentSizeChange(320, 480);
      jest.advanceTimersByTime(1000);
    });
    await rerender({ ready: true });
    await act(() => {
      result.current.onContentSizeChange(320, 3800);
      jest.advanceTimersByTime(200);
    });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(result.current.restoredOffset).toBeNull();
  });
});
