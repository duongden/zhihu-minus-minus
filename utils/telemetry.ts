import type { Analytics, EventParams } from '@react-native-firebase/analytics';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

interface AppExtra {
  firebaseAnalyticsEnabled?: unknown;
  sentryDsn?: unknown;
}

const appExtra = Constants.expoConfig?.extra as AppExtra | undefined;
const sentryDsnFromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const sentryDsn =
  sentryDsnFromEnv ||
  (typeof appExtra?.sentryDsn === 'string' ? appExtra.sentryDsn : undefined);
const firebaseAnalyticsConfigured =
  process.env.EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED === 'true' ||
  appExtra?.firebaseAnalyticsEnabled === true;

let telemetryEnabled = false;
let sentryInitialized = false;
let firebaseAnalyticsPromise: Promise<Analytics | null> | null = null;

function initializeSentry() {
  if (!sentryDsn || sentryInitialized) return;

  Sentry.init({
    dsn: sentryDsn,
    debug: __DEV__,
    enableAutoSessionTracking: false,
    beforeSend: (event) => (telemetryEnabled ? event : null),
    beforeSendTransaction: (event) => (telemetryEnabled ? event : null),
  });

  const deviceContext = {
    appVersion: Constants.expoConfig?.version,
    deviceName: Constants.deviceName,
    osVersion: Constants.systemVersion,
    platform: Constants.platform,
  };
  Sentry.setContext('device', deviceContext);
  Sentry.setTag('app_version', deviceContext.appVersion || 'unknown');
  Sentry.setTag(
    'platform',
    deviceContext.platform?.ios
      ? 'ios'
      : deviceContext.platform?.android
        ? 'android'
        : 'other',
  );

  sentryInitialized = true;
}

async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!firebaseAnalyticsConfigured) return null;
  if (firebaseAnalyticsPromise) return firebaseAnalyticsPromise;

  firebaseAnalyticsPromise = import('@react-native-firebase/analytics')
    .then(({ getAnalytics }) => getAnalytics())
    .catch(() => null);

  return firebaseAnalyticsPromise;
}

export function initializeTelemetry() {
  initializeSentry();
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  telemetryEnabled = enabled;

  if (!enabled) {
    Sentry.setUser(null);
  }

  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;

  try {
    await analytics.setAnalyticsCollectionEnabled(enabled);
  } catch {
    // Missing or invalid native Firebase configuration must not affect startup.
  }
}

export async function logTelemetryEvent(
  name: string,
  params?: EventParams,
): Promise<void> {
  if (!telemetryEnabled) return;

  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;

  try {
    await analytics.logEvent(name, params);
  } catch {
    // Telemetry failures are deliberately isolated from product behavior.
  }
}

export function captureTelemetryException(error: unknown): void {
  if (!telemetryEnabled) return;
  Sentry.captureException(error);
}

export function isTelemetryConfigured(): boolean {
  return Boolean(sentryDsn || firebaseAnalyticsConfigured);
}

initializeTelemetry();
