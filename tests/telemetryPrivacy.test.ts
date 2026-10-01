import { getAnalytics } from '@react-native-firebase/analytics';
import * as Sentry from '@sentry/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  captureTelemetryException,
  logTelemetryEvent,
  setTelemetryEnabled,
} from '../utils/telemetry';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '0.7.0',
      extra: {
        firebaseAnalyticsEnabled: true,
        sentryDsn: 'https://test@example.invalid/1',
      },
    },
    systemVersion: '18.0',
    platform: { ios: {} },
  },
}));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('@react-native-firebase/analytics', () => {
  const analytics = {
    setAnalyticsCollectionEnabled: jest.fn(async () => undefined),
    logEvent: jest.fn(async () => undefined),
  };
  return { getAnalytics: jest.fn(() => analytics) };
});
jest.mock('../utils/firebaseAnalytics', () => ({
  loadFirebaseAnalytics: jest.fn(async () =>
    require('@react-native-firebase/analytics').getAnalytics(),
  ),
}));

const analytics = getAnalytics();
const collection = jest.mocked(analytics.setAnalyticsCollectionEnabled);
const logEvent = jest.mocked(analytics.logEvent);
const sentryOptions = jest.mocked(Sentry.init).mock.calls[0]?.[0];

beforeEach(async () => {
  await setTelemetryEnabled(false);
  jest.clearAllMocks();
  collection.mockResolvedValue(undefined);
  logEvent.mockResolvedValue(undefined);
});

test('drops an event whose pending SDK load crosses an opt-out', async () => {
  await setTelemetryEnabled(true);
  const pending = logTelemetryEvent('test_event', { count: 1 });
  const disabling = setTelemetryEnabled(false);
  await Promise.all([pending, disabling]);
  expect(logEvent).not.toHaveBeenCalled();
  expect(collection).toHaveBeenLastCalledWith(false);
});

test('does not revive a pending event when telemetry is disabled then enabled', async () => {
  await setTelemetryEnabled(true);
  const pending = logTelemetryEvent('test_event');
  const disabling = setTelemetryEnabled(false);
  const enabling = setTelemetryEnabled(true);
  await Promise.all([pending, disabling, enabling]);
  expect(logEvent).not.toHaveBeenCalled();
});

test('a slow native enable completes before the later disable is applied', async () => {
  let finishEnable: (() => void) | undefined;
  let started: (() => void) | undefined;
  const enableStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  collection.mockImplementation(async (enabled) => {
    if (!enabled) return;
    started?.();
    await new Promise<void>((resolve) => {
      finishEnable = resolve;
    });
  });
  const enabling = setTelemetryEnabled(true);
  await enableStarted;
  const disabling = setTelemetryEnabled(false);
  expect(collection.mock.calls.map(([enabled]) => enabled)).toEqual([true]);
  finishEnable?.();
  await Promise.all([enabling, disabling]);
  expect(collection.mock.calls.map(([enabled]) => enabled)).toEqual([
    true,
    false,
  ]);
});

test('exception capture contains a safe category without Axios session data', async () => {
  await setTelemetryEnabled(true);
  const config = {
    headers: new AxiosHeaders({ Cookie: 'z_c0=synthetic-test' }),
  };
  const error = new AxiosError(
    'synthetic-private-detail',
    'ERR_BAD_REQUEST',
    config,
    { privateDetail: 'synthetic-private-request' },
    {
      config,
      headers: {},
      data: { privateDetail: 'synthetic-private-response' },
      status: 500,
      statusText: 'Server Error',
    },
  );
  captureTelemetryException(error);
  const captured = jest.mocked(Sentry.captureException).mock.calls[0]?.[0];
  expect(captured).toBeInstanceOf(Error);
  expect(captured).toMatchObject({ message: 'HTTP failure: 500' });
  expect(captured).not.toBe(error);
  expect(captured).not.toHaveProperty('config');
  expect(captured).not.toHaveProperty('request');
  expect(captured).not.toHaveProperty('response');
});

test('keeps known exception types and symbolication frames without original message', async () => {
  await setTelemetryEnabled(true);
  const error = new TypeError('synthetic-private-detail');
  error.stack =
    'TypeError: synthetic-private-detail\n    at example (https://bundle.invalid/app.js?synthetic=private:1:2)';
  captureTelemetryException(error);
  const captured = jest.mocked(Sentry.captureException).mock.calls[0]?.[0];
  expect(captured).toMatchObject({
    name: 'TypeError',
    message: 'Application failure',
  });
  expect(captured).toHaveProperty(
    'stack',
    'TypeError: Application failure\n    at example (https://bundle.invalid/app.js:1:2)',
  );
});

test('both Sentry event callbacks use the safe contract and honor opt-out', async () => {
  await setTelemetryEnabled(true);
  const options = sentryOptions;
  if (!options?.beforeSend || !options.beforeSendTransaction)
    throw new Error('Sentry callbacks must be initialized');
  const event = () => ({
    type: undefined,
    request: { headers: { Cookie: 'synthetic-test' } },
    extra: { config: 'synthetic-test' },
    breadcrumbs: [{ message: 'synthetic-test' }],
  });
  const safeBase = {
    platform: 'javascript',
    release: 'zhihu-minus-minus@0.7.0',
    environment: 'development',
    tags: { app_version: '0.7.0', platform: 'ios' },
    contexts: {
      app: { app_version: '0.7.0' },
      os: { name: 'ios', version: '18.0' },
      device: {},
    },
  };
  expect(await options.beforeSend(event(), {})).toEqual(safeBase);
  expect(
    await options.beforeSendTransaction(
      { ...event(), type: 'transaction' },
      {},
    ),
  ).toEqual({
    ...safeBase,
    type: 'transaction',
    transaction: 'Application transaction',
    spans: undefined,
  });
  await setTelemetryEnabled(false);
  expect(await options.beforeSend(event(), {})).toBeNull();
  expect(
    await options.beforeSendTransaction(
      { ...event(), type: 'transaction' },
      {},
    ),
  ).toBeNull();
});

test('disables unfiltered native collection while retaining the JS error callbacks', () => {
  expect(sentryOptions).toMatchObject({
    enableNative: false,
    sendDefaultPii: false,
    sendClientReports: false,
    debug: false,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  expect(sentryOptions?.beforeSend).toEqual(expect.any(Function));
});

test('automatic JS errors retain type and code locations while dropping arbitrary SDK fields', async () => {
  await setTelemetryEnabled(true);
  if (!sentryOptions?.beforeSend) throw new Error('Missing Sentry callback');
  const privateValue = 'synthetic-private-value';
  const debugId = '12345678-1234-1234-1234-123456789abc';
  const event: Sentry.ErrorEvent = {
    type: undefined,
    message: privateValue,
    logentry: { message: privateValue, params: [privateValue] },
    user: { id: privateValue, email: privateValue },
    logger: privateValue,
    server_name: privateValue,
    release: privateValue,
    environment: privateValue,
    tags: { account: privateValue },
    fingerprint: [privateValue],
    modules: { [privateValue]: privateValue },
    request: { headers: { Cookie: privateValue } },
    extra: { config: privateValue },
    breadcrumbs: [{ message: privateValue }],
    contexts: {
      device: {
        name: privateValue,
        model: privateValue,
        device_unique_identifier: privateValue,
        arch: 'arm64',
        memory_size: 1024,
      },
      app: { app_identifier: privateValue, app_version: privateValue },
      os: { name: privateValue, version: privateValue },
      culture: { timezone: privateValue },
      custom: { secret: privateValue },
      trace: {
        trace_id: '1'.repeat(32),
        span_id: '2'.repeat(16),
        op: 'http.client',
        status: 'internal_error',
        data: { url: privateValue },
        tags: { account: privateValue },
      },
    },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: privateValue,
          module: privateValue,
          mechanism: {
            type: 'generic',
            handled: false,
            data: { error: privateValue },
          },
          stacktrace: {
            frames: [
              {
                filename: `https://${privateValue}.invalid/path/entry.js?token=${privateValue}`,
                abs_path: privateValue,
                function: privateValue,
                context_line: privateValue,
                pre_context: [privateValue],
                post_context: [privateValue],
                vars: { session: privateValue },
                lineno: 123,
                colno: 45,
                in_app: true,
                debug_id: debugId,
              },
              {
                filename: `${privateValue}.js`,
                lineno: 7,
                colno: 8,
              },
            ],
          },
        },
      ],
    },
    debug_meta: {
      images: [
        {
          type: 'sourcemap',
          debug_id: debugId,
          code_file: `app:///index.ios.bundle?token=${privateValue}`,
        },
      ],
    },
  };
  const hint = {
    attachments: [{ filename: privateValue, data: privateValue }],
  };
  const safe = await sentryOptions.beforeSend(event, hint);
  expect(hint.attachments).toEqual([]);
  expect(JSON.stringify(safe)).not.toContain(privateValue);
  expect(safe).not.toBe(event);
  expect(safe?.exception?.values?.[0]).toEqual({
    type: 'TypeError',
    value: 'Application failure',
    mechanism: { type: 'generic', handled: false },
    stacktrace: {
      frames: [
        {
          filename: 'source.js',
          lineno: 123,
          colno: 45,
          in_app: true,
          debug_id: debugId,
        },
        { filename: 'source.js', lineno: 7, colno: 8 },
      ],
    },
  });
  expect(safe?.debug_meta?.images?.[0]).toEqual({
    type: 'sourcemap',
    debug_id: debugId,
    code_file: 'app:///index.ios.bundle',
  });
  expect(safe?.contexts?.device).toEqual({ arch: 'arm64', memory_size: 1024 });
  expect(safe?.contexts?.trace).toEqual({
    trace_id: '1'.repeat(32),
    span_id: '2'.repeat(16),
    op: 'http.client',
    status: 'internal_error',
  });
});

test('transactions discard route names, span URLs and free-form attributes', async () => {
  await setTelemetryEnabled(true);
  if (!sentryOptions?.beforeSendTransaction)
    throw new Error('Missing Sentry callback');
  const privateValue = 'synthetic-private-value';
  const event: Sentry.TransactionEvent = {
    type: 'transaction',
    transaction: privateValue,
    spans: [
      {
        trace_id: '1'.repeat(32),
        span_id: '2'.repeat(16),
        start_timestamp: 10,
        timestamp: 12,
        op: 'http.client',
        description: privateValue,
        data: { url: privateValue, cookie: privateValue },
      },
    ],
  };
  const safe = await sentryOptions.beforeSendTransaction(event, {});
  expect(JSON.stringify(safe)).not.toContain(privateValue);
  expect(safe?.transaction).toBe('Application transaction');
  expect(safe?.spans?.[0]).toEqual({
    trace_id: '1'.repeat(32),
    span_id: '2'.repeat(16),
    start_timestamp: 10,
    timestamp: 12,
    op: 'http.client',
    data: {},
  });
});
