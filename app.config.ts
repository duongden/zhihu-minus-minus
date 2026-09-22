import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

function existingPath(value: string | undefined): string | undefined {
  return value && existsSync(value) ? value : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = config as ExpoConfig;
  const androidGoogleServicesFile = existingPath(
    process.env.GOOGLE_SERVICES_JSON,
  );
  const iosGoogleServicesFile = existingPath(
    process.env.GOOGLE_SERVICE_INFO_PLIST,
  );

  return {
    ...baseConfig,
    name: baseConfig.name,
    android: {
      ...baseConfig.android,
      ...(androidGoogleServicesFile
        ? { googleServicesFile: androidGoogleServicesFile }
        : {}),
    },
    ios: {
      ...baseConfig.ios,
      ...(iosGoogleServicesFile
        ? { googleServicesFile: iosGoogleServicesFile }
        : {}),
    },
    extra: {
      ...baseConfig.extra,
      firebaseAnalyticsEnabled:
        process.env.EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED === 'true',
      ...(process.env.EXPO_PUBLIC_SENTRY_DSN
        ? { sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN }
        : {}),
    },
  };
};
