import type { Event, StackFrame } from '@sentry/react-native';

export interface TelemetryBuildContext {
  appVersion?: string;
  osVersion?: string | null;
  platform: 'ios' | 'android' | 'other';
  environment: 'development' | 'production';
}

const ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AxiosError',
  'AggregateError',
]);
const OPERATIONS = new Set([
  'http.client',
  'http.server',
  'navigation',
  'pageload',
  'ui.load',
  'ui.action',
  'app.start.cold',
  'app.start.warm',
]);
const STATUSES = new Set([
  'ok',
  'unknown_error',
  'internal_error',
  'cancelled',
  'deadline_exceeded',
  'resource_exhausted',
  'invalid_argument',
  'unavailable',
  'not_found',
  'permission_denied',
  'unauthenticated',
]);

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function hex(value: unknown, length: number): string | undefined {
  return typeof value === 'string' &&
    new RegExp(`^[a-fA-F0-9]{${length}}$`).test(value)
    ? value
    : undefined;
}

function uuid(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value)
    ? value
    : undefined;
}

function version(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d+(?:[._-]\d+){0,4}$/.test(value)
    ? value
    : undefined;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined {
  return typeof value === 'string' && allowed.has(value as T)
    ? (value as T)
    : undefined;
}

const BUNDLE_FILENAMES = new Set([
  'index.bundle',
  'index.android.bundle',
  'index.ios.bundle',
  'main.jsbundle',
  'entry.bundle',
  'index.js',
]);

/** Retain known app bundle names; arbitrary script names can contain user data. */
function codeFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const path = value.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  const basename = path.slice(path.lastIndexOf('/') + 1);
  if (
    basename.length > 128 ||
    !/^[\w.-]+\.(?:js|mjs|cjs|jsx|ts|tsx|bundle|jsbundle|hbc)$/.test(basename)
  )
    return undefined;
  if (!BUNDLE_FILENAMES.has(basename)) return 'source.js';
  return path.startsWith('app:///') ? `app:///${basename}` : basename;
}

function sanitizeFrame(frame: StackFrame): StackFrame {
  // Function/module names, source context and vars may contain runtime values.
  return compact({
    filename: codeFilename(frame.filename ?? frame.abs_path),
    lineno: integer(frame.lineno),
    colno: integer(frame.colno),
    in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
    debug_id: uuid(frame.debug_id),
  });
}

function safeExceptionMessage(value: unknown): string {
  if (
    typeof value === 'string' &&
    (/^HTTP failure: [1-5]\d{2}$/.test(value) ||
      /^Network failure: (?:canceled|timeout|offline|dns-error|tls-error|connection-reset|connection-refused|connection-error|network-error)$/.test(
        value,
      ))
  )
    return value;
  return 'Application failure';
}

/** Rebuild the event instead of trying to blacklist arbitrary SDK additions. */
export function sanitizeSentryEvent<T extends Event>(
  event: T,
  build: TelemetryBuildContext,
): T | null {
  if (event.type !== undefined && event.type !== 'transaction') return null;
  const safe: Event = compact({
    type: event.type,
    event_id: hex(event.event_id, 32),
    timestamp: finite(event.timestamp),
    start_timestamp: finite(event.start_timestamp),
    level: enumValue(
      event.level,
      new Set(['fatal', 'error', 'warning', 'log', 'info', 'debug'] as const),
    ),
    platform: 'javascript',
    release: version(build.appVersion)
      ? `zhihu-minus-minus@${build.appVersion}`
      : undefined,
    environment: build.environment,
    tags: compact({
      app_version: version(build.appVersion),
      platform: build.platform,
    }),
  });

  if (event.exception?.values) {
    safe.exception = {
      values: event.exception.values.slice(0, 8).map((exception) => {
        const mechanism = exception.mechanism;
        return compact({
          type: enumValue(exception.type, ERROR_TYPES) ?? 'Error',
          value: safeExceptionMessage(exception.value),
          stacktrace: exception.stacktrace?.frames
            ? {
                frames: exception.stacktrace.frames
                  .slice(-100)
                  .map(sanitizeFrame),
              }
            : undefined,
          mechanism: mechanism
            ? compact({
                type:
                  enumValue(
                    mechanism.type,
                    new Set([
                      'generic',
                      'onerror',
                      'onunhandledrejection',
                      'instrument',
                      'auto.core.react',
                      'auto.react.errorboundary',
                    ]),
                  ) ?? 'generic',
                handled:
                  typeof mechanism.handled === 'boolean'
                    ? mechanism.handled
                    : undefined,
                synthetic:
                  typeof mechanism.synthetic === 'boolean'
                    ? mechanism.synthetic
                    : undefined,
              })
            : undefined,
        });
      }),
    };
  } else if (event.message || event.logentry) {
    safe.message = 'Application event';
  }

  const device = event.contexts?.device;
  safe.contexts = {
    app: compact({ app_version: version(build.appVersion) }),
    os: compact({ name: build.platform, version: version(build.osVersion) }),
    device: compact({
      arch: enumValue(
        device?.arch,
        new Set(['arm', 'arm64', 'arm64-v8a', 'x86', 'x86_64']),
      ),
      orientation: enumValue(
        device?.orientation,
        new Set(['portrait', 'landscape'] as const),
      ),
      simulator:
        typeof device?.simulator === 'boolean' ? device.simulator : undefined,
      memory_size: finite(device?.memory_size),
      free_memory: finite(device?.free_memory),
      screen_height_pixels: integer(device?.screen_height_pixels),
      screen_width_pixels: integer(device?.screen_width_pixels),
    }),
  };
  const trace = event.contexts?.trace;
  const traceId = hex(trace?.trace_id, 32);
  const spanId = hex(trace?.span_id, 16);
  if (traceId && spanId) {
    safe.contexts.trace = compact({
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: hex(trace?.parent_span_id, 16),
      op: enumValue(trace?.op, OPERATIONS),
      status: enumValue(trace?.status, STATUSES),
    });
  }

  // Debug IDs preserve production source-map symbolication without full paths.
  const images = event.debug_meta?.images?.flatMap((image) => {
    const debugId = uuid(image.debug_id);
    const codeFile = codeFilename(image.code_file);
    return image.type === 'sourcemap' && debugId && codeFile
      ? [{ type: 'sourcemap' as const, debug_id: debugId, code_file: codeFile }]
      : [];
  });
  if (images?.length) safe.debug_meta = { images: images.slice(0, 10) };
  if (event.type === 'transaction') {
    safe.transaction = 'Application transaction';
    safe.spans = event.spans?.slice(0, 100).flatMap((span) => {
      const spanTraceId = hex(span.trace_id, 32);
      const id = hex(span.span_id, 16);
      const start = finite(span.start_timestamp);
      if (!spanTraceId || !id || start === undefined) return [];
      return [
        compact({
          trace_id: spanTraceId,
          span_id: id,
          parent_span_id: hex(span.parent_span_id, 16),
          start_timestamp: start,
          timestamp: finite(span.timestamp),
          op: enumValue(span.op, OPERATIONS),
          status: enumValue(span.status, STATUSES),
          data: {},
        }),
      ];
    });
  }
  // The discriminator is retained; all returned fields are valid Event fields.
  return safe as T;
}
