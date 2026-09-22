import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const firebasePluginNames = new Set([
  '@react-native-firebase/app',
  '@react-native-firebase/analytics',
]);

function existingPath(value: string | undefined): string | undefined {
  return value && existsSync(value) ? value : undefined;
}

function withoutFirebasePlugins(
  plugins: ExpoConfig['plugins'],
): ExpoConfig['plugins'] {
  return plugins?.filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return (
      typeof pluginName !== 'string' || !firebasePluginNames.has(pluginName)
    );
  });
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig = config as ExpoConfig;
  const firebaseAnalyticsEnabled =
    process.env.EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED === 'true';
  const androidGoogleServicesFile = existingPath(
    process.env.GOOGLE_SERVICES_JSON,
  );
  const iosGoogleServicesFile = existingPath(
    process.env.GOOGLE_SERVICE_INFO_PLIST,
  );

  return {
    ...baseConfig,
    name: baseConfig.name,
    plugins: firebaseAnalyticsEnabled
      ? baseConfig.plugins
      : withoutFirebasePlugins(baseConfig.plugins),
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
      firebaseAnalyticsEnabled,
      ...(process.env.EXPO_PUBLIC_SENTRY_DSN
        ? { sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN }
        : {}),
    },
  };
};
