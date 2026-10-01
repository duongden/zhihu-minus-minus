import type { Analytics, EventParams } from '@react-native-firebase/analytics';
import * as Sentry from '@sentry/react-native';
import axios from 'axios';
import Constants from 'expo-constants';
import { loadFirebaseAnalytics } from './firebaseAnalytics';
import { classifyNetworkError } from './networkFailure';
import {
  sanitizeSentryEvent,
  type TelemetryBuildContext,
} from './telemetrySanitizer';

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
let telemetryVersion = 0;
let collectionUpdateChain: Promise<void> = Promise.resolve();

const buildContext: TelemetryBuildContext = {
  appVersion: Constants.expoConfig?.version,
  osVersion:
    Constants.systemVersion === undefined
      ? undefined
      : String(Constants.systemVersion),
  platform: Constants.platform?.ios
    ? 'ios'
    : Constants.platform?.android
      ? 'android'
      : 'other',
  environment: __DEV__ ? 'development' : 'production',
};

function sanitizeTelemetryEvent<T extends Sentry.Event>(
  event: T,
  hint: Parameters<NonNullable<Sentry.ReactNativeOptions['beforeSend']>>[1],
): T | null {
  // Attachments live outside Event and would bypass the field whitelist.
  hint.attachments = [];
  if (!telemetryEnabled) return null;
  return sanitizeSentryEvent(event, buildContext);
}

function initializeSentry() {
  if (!sentryDsn || sentryInitialized) return;

  Sentry.init({
    dsn: sentryDsn,
    debug: false,
    // Native crashes bypass JS beforeSend and opt-out. Keep automatic JS
    // errors, but do not initialize a separate unfiltered native transport.
    enableNative: false,
    release: buildContext.appVersion
      ? `zhihu-minus-minus@${buildContext.appVersion}`
      : undefined,
    environment: buildContext.environment,
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoPerformanceTracing: false,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableAutoSessionTracking: false,
    beforeSend: sanitizeTelemetryEvent,
    beforeSendTransaction: sanitizeTelemetryEvent,
  });

  sentryInitialized = true;
}

async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!firebaseAnalyticsConfigured) return null;
  if (firebaseAnalyticsPromise) return firebaseAnalyticsPromise;

  firebaseAnalyticsPromise = loadFirebaseAnalytics();

  return firebaseAnalyticsPromise;
}

export function initializeTelemetry() {
  initializeSentry();
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  telemetryEnabled = enabled;
  telemetryVersion += 1;

  if (!enabled) {
    Sentry.setUser(null);
  }

  // Serialize native changes so an earlier, slower enable cannot win over a
  // later opt-out. Resolve the desired value when each queued update starts.
  collectionUpdateChain = collectionUpdateChain.then(async () => {
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;
    try {
      await analytics.setAnalyticsCollectionEnabled(telemetryEnabled);
    } catch {
      // Missing or invalid native Firebase configuration must not affect startup.
    }
  });
  await collectionUpdateChain;
}

export async function logTelemetryEvent(
  name: string,
  params?: EventParams,
): Promise<void> {
  if (!telemetryEnabled) return;
  const version = telemetryVersion;

  const analytics = await getFirebaseAnalytics();
  if (!analytics || !telemetryEnabled || version !== telemetryVersion) return;

  try {
    await analytics.logEvent(name, params);
  } catch {
    // Telemetry failures are deliberately isolated from product behavior.
  }
}

export function captureTelemetryException(error: unknown): void {
  if (!telemetryEnabled) return;
  // Axios errors carry config/request objects containing the complete session.
  // Send a new error with a fixed category instead of forwarding that object.
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const message = axios.isAxiosError(error)
    ? status === undefined
      ? `Network failure: ${classifyNetworkError(error, axios.isCancel(error))}`
      : `HTTP failure: ${status}`
    : 'Application failure';
  const safeError = new Error(message);
  if (error instanceof Error) {
    const knownNames = [
      'Error',
      'TypeError',
      'RangeError',
      'ReferenceError',
      'SyntaxError',
      'URIError',
      'EvalError',
      'AxiosError',
      'AggregateError',
    ];
    if (knownNames.includes(error.name)) safeError.name = error.name;
    // Preserve symbolication frames without retaining the exception message
    // or query/fragment data in bundle URLs.
    const frames = error.stack
      ?.split('\n')
      .slice(1)
      .filter((line) => /^\s*at\s|^[\w$.[\]<>]*@/.test(line))
      .map((line) =>
        line.replace(
          /\b(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g,
          (match, url: string) => {
            const location = match.match(/(:\d+(?::\d+)?)$/)?.[1] ?? '';
            return `${url}${location}`;
          },
        ),
      );
    if (frames?.length)
      safeError.stack = `${safeError.name}: ${message}\n${frames.join('\n')}`;
  }
  Sentry.captureException(safeError);
}

export function isTelemetryConfigured(): boolean {
  return Boolean(sentryDsn || firebaseAnalyticsConfigured);
}

initializeTelemetry();
