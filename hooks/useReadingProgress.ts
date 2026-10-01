import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
  /** Native content requires an actual measurement paired with this identity. */
  layoutSource?: object;
  scrollRef: React.RefObject<ScrollToRef | null>;
}

export type CompleteReadingContentMeasurement = (
  width: number,
  height: number,
) => void;

const SAVE_DELAY_MS = 1200;
const RESTORE_DELAY_MS = 180;

export function useReadingProgress({
  contentKey,
  enabled = true,
  ready = true,
  layoutSource,
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
  const restoreEligibilityRef = useRef({
    contentKey,
    enabled,
    ready,
    layoutSource,
  });
  restoreEligibilityRef.current = { contentKey, enabled, ready, layoutSource };
  const measurementScopeRef = useRef({
    contentKey,
    enabled,
    layoutSource,
    epoch: 0,
  });
  const measurementRequestRef = useRef(0);
  const actualMeasurementRef = useRef<{
    layoutSource: object;
    height: number;
    epoch: number;
    request: number;
  } | null>(null);
  const committedTryRestoreRef = useRef<() => void>(() => {});
  const progressIdentityRef = useRef(contentKey);

  useLayoutEffect(() => {
    measurementScopeRef.current = {
      contentKey,
      enabled,
      layoutSource,
      epoch: measurementScopeRef.current.epoch + 1,
    };
    measurementRequestRef.current += 1;
    actualMeasurementRef.current = null;
    return () => {
      measurementScopeRef.current.enabled = false;
      measurementRequestRef.current += 1;
      actualMeasurementRef.current = null;
    };
  }, [contentKey, enabled, layoutSource]);

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

  useLayoutEffect(() => {
    if (progressIdentityRef.current !== contentKey) {
      progressIdentityRef.current = contentKey;
      contentHeightRef.current = 0;
      contentMeasuredWhileReadyRef.current = false;
      offsetRef.current = 0;
      restoredRef.current = false;
      setRestoredOffset(null);
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      saveTimerRef.current = null;
      restoreTimerRef.current = null;
      // Save the outgoing identity before the next layout resets shared refs.
      commitProgress();
    };
  }, [contentKey, commitProgress]);

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
    const measured = actualMeasurementRef.current;
    const hasActualMeasurement =
      measured?.layoutSource === layoutSource &&
      measured?.epoch === measurementScopeRef.current.epoch &&
      measured?.request === measurementRequestRef.current;
    if (
      (layoutSource
        ? !hasActualMeasurement
        : !contentMeasuredWhileReadyRef.current) ||
      contentHeightRef.current <= 0 ||
      viewportHeightRef.current <= 0
    ) {
      return;
    }

    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      restoreTimerRef.current = null;
      const current = restoreEligibilityRef.current;
      if (
        !current.enabled ||
        !current.ready ||
        current.contentKey !== contentKey ||
        current.layoutSource !== layoutSource ||
        restoredRef.current
      )
        return;
      const actual = actualMeasurementRef.current;
      if (
        layoutSource &&
        (actual?.layoutSource !== layoutSource ||
          actual?.epoch !== measurementScopeRef.current.epoch ||
          actual?.request !== measurementRequestRef.current)
      )
        return;
      const targetOffset = resolveReadingProgressOffset(
        entry,
        layoutSource && actual ? actual.height : contentHeightRef.current,
        viewportHeightRef.current,
      );
      offsetRef.current = targetOffset;
      scrollRef.current?.scrollTo({ y: targetOffset, animated: false });
      restoredRef.current = true;
      setRestoredOffset(targetOffset);
    }, RESTORE_DELAY_MS);
  }, [contentKey, enabled, entry, hasHydrated, ready, layoutSource, scrollRef]);

  useLayoutEffect(() => {
    committedTryRestoreRef.current = tryRestore;
  }, [tryRestore]);

  const beginContentMeasurement =
    useCallback((): CompleteReadingContentMeasurement | null => {
      const scope = measurementScopeRef.current;
      if (
        !scope.enabled ||
        !layoutSource ||
        scope.contentKey !== contentKey ||
        scope.layoutSource !== layoutSource
      )
        return null;
      const request = ++measurementRequestRef.current;
      return (width, height) => {
        const current = measurementScopeRef.current;
        if (
          !current.enabled ||
          current.contentKey !== contentKey ||
          current.layoutSource !== layoutSource ||
          current.epoch !== scope.epoch ||
          measurementRequestRef.current !== request ||
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        )
          return;
        actualMeasurementRef.current = {
          layoutSource,
          height,
          epoch: scope.epoch,
          request,
        };
        contentHeightRef.current = height;
        // Readiness may have committed since this async measurement was requested.
        committedTryRestoreRef.current();
      };
    }, [contentKey, layoutSource]);

  useEffect(() => {
    if (!ready) contentMeasuredWhileReadyRef.current = false;
    tryRestore();
    return () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    };
  }, [ready, tryRestore]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') commitProgress();
    });
    return () => subscription.remove();
  }, [commitProgress]);

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
      const current = measurementScopeRef.current;
      if (
        layoutSource &&
        (!current.enabled ||
          current.contentKey !== contentKey ||
          current.layoutSource !== layoutSource)
      )
        return;
      contentHeightRef.current = height;
      if (!layoutSource && ready) contentMeasuredWhileReadyRef.current = true;
      tryRestore();
    },
    [contentKey, layoutSource, ready, tryRestore],
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
    beginContentMeasurement,
    commitProgress,
    dismissRestoreNotice,
    onContentSizeChange,
    onLayout,
    onScroll,
    restoredOffset,
    scrollToTop,
  };
}
