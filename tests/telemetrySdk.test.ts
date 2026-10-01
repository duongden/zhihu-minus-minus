import * as Sentry from '@sentry/react-native';
import { sanitizeSentryEvent } from '../utils/telemetrySanitizer';

// The SDK imports this idle tracing interval even when tracing is disabled.
// It is unrelated to the actual JS event/transport path exercised below.
jest.mock('@sentry/react-native/dist/js/tracing/timeToDisplayFallback', () => ({
  addTimeToInitialDisplayFallback: jest.fn(),
  getTimeToInitialDisplayFallback: jest.fn(async () => null),
}));

test('the actual Sentry JS client captures a sanitized error with native collection disabled', async () => {
  const sent: Sentry.Event[] = [];
  const envelopes: unknown[] = [];
  Sentry.init({
    dsn: 'https://synthetic@example.invalid/1',
    debug: false,
    enableNative: false,
    // Jest does not need the JSC Promise polyfill or Metro debug requests.
    patchGlobalPromise: false,
    integrations: (integrations) =>
      integrations.filter(
        (integration) => integration.name !== 'DebugSymbolicator',
      ),
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    release: 'zhihu-minus-minus@0.7.0',
    environment: 'production',
    beforeSend: (event, hint) => {
      hint.attachments = [];
      return sanitizeSentryEvent(event, {
        appVersion: '0.7.0',
        osVersion: '18.0',
        platform: 'ios',
        environment: 'production',
      });
    },
    // A local transport exercises SDK serialization without sending data.
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'event') sent.push(payload as Sentry.Event);
        }
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  try {
    expect(Sentry.getClient()?.getOptions()).toMatchObject({
      enableNative: false,
    });
    const privateValue = 'synthetic-private-detail';
    Sentry.setUser({ email: privateValue });
    Sentry.setContext('device', { name: privateValue });
    Sentry.setExtra('Cookie', privateValue);
    const error = new TypeError(privateValue);
    error.stack = `TypeError: ${privateValue}\n    at example (app:///index.android.bundle:12:7)`;
    Sentry.captureException(error, {
      attachments: [{ filename: privateValue, data: privateValue }],
    });
    await Sentry.getClient()?.flush(2000);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain(privateValue);
    expect(JSON.stringify(envelopes)).not.toContain(privateValue);
    expect(sent[0].exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: 'Application failure',
      stacktrace: {
        frames: [{ filename: 'app:///main.jsbundle', lineno: 12, colno: 7 }],
      },
    });
  } finally {
    await Sentry.close();
  }
});
