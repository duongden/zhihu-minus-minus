import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type LayoutChangeEvent } from 'react-native';
import { useProgressStore } from '@/store/useProgressStore';
import {
  calculateReadingProgress,
  resolveReadingProgressOffset,
} from '@/utils/readingProgress';

interface ScrollToRef {
  scrollTo: (options: { y: number; animated: boolean }) => void;
}

interface UseReadingProgressOptions {
  contentKey: string;
  enabled?: boolean;
  ready?: boolean;
  scrollRef: React.RefObject<ScrollToRef | null>;
}

const SAVE_DELAY_MS = 1200;
const RESTORE_DELAY_MS = 180;

export function useReadingProgress({
  contentKey,
  enabled = true,
  ready = true,
  scrollRef,
}: UseReadingProgressOptions) {
  const entry = useProgressStore((state) => state.progress[contentKey]);
  const saveProgress = useProgressStore((state) => state.saveProgress);
  const removeProgress = useProgressStore((state) => state.removeProgress);
  const [hasHydrated, setHasHydrated] = useState(() =>
    useProgressStore.persist.hasHydrated(),
  );
  const [restoredOffset, setRestoredOffset] = useState<number | null>(null);

  const contentHeightRef = useRef(0);
  const contentMeasuredWhileReadyRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const offsetRef = useRef(0);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useProgressStore.persist.onFinishHydration(() =>
      setHasHydrated(true),
    );
    if (useProgressStore.persist.hasHydrated()) setHasHydrated(true);
    return unsubscribe;
  }, []);

  const commitProgress = useCallback(() => {
    if (!enabled || !restoredRef.current) return;

    const result = calculateReadingProgress(
      offsetRef.current,
      contentHeightRef.current,
      viewportHeightRef.current,
    );

    if (result.status === 'active') {
      saveProgress(contentKey, result.entry);
    } else if (result.status === 'complete' || result.status === 'at-start') {
      removeProgress(contentKey);
    }
  }, [contentKey, enabled, removeProgress, saveProgress]);

  const scheduleSave = useCallback(() => {
    if (!enabled || !restoredRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(commitProgress, SAVE_DELAY_MS);
  }, [commitProgress, enabled]);

  const tryRestore = useCallback(() => {
    if (!enabled || !ready || !hasHydrated || restoredRef.current) return;
    if (!entry) {
      restoredRef.current = true;
      return;
    }
    if (
      !contentMeasuredWhileReadyRef.current ||
      contentHeightRef.current <= 0 ||
      viewportHeightRef.current <= 0
    ) {
      return;
    }

    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      const targetOffset = resolveReadingProgressOffset(
        entry,
        contentHeightRef.current,
        viewportHeightRef.current,
      );
      offsetRef.current = targetOffset;
      scrollRef.current?.scrollTo({ y: targetOffset, animated: false });
      restoredRef.current = true;
      setRestoredOffset(targetOffset);
    }, RESTORE_DELAY_MS);
  }, [enabled, entry, hasHydrated, ready, scrollRef]);

  useEffect(() => {
    tryRestore();
  }, [tryRestore]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') commitProgress();
    });
    return () => subscription.remove();
  }, [commitProgress]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      commitProgress();
    },
    [commitProgress],
  );

  const onScroll = useCallback(
    (offset: number) => {
      offsetRef.current = Math.max(0, offset);
      scheduleSave();
    },
    [scheduleSave],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeightRef.current = event.nativeEvent.layout.height;
      tryRestore();
    },
    [tryRestore],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      if (ready) contentMeasuredWhileReadyRef.current = true;
      tryRestore();
    },
    [ready, tryRestore],
  );

  const dismissRestoreNotice = useCallback(() => {
    setRestoredOffset(null);
  }, []);

  const scrollToTop = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    offsetRef.current = 0;
    setRestoredOffset(null);
    removeProgress(contentKey);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [contentKey, removeProgress, scrollRef]);

  return {
    commitProgress,
    dismissRestoreNotice,
    onContentSizeChange,
    onLayout,
    onScroll,
    restoredOffset,
    scrollToTop,
  };
}
