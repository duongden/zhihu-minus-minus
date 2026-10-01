const fs = require('node:fs');
const path = require('node:path');
const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const TAG = 'zhihu-ios-scene-lifecycle';
const SCENE_CLASS = 'ZhihuSceneDelegate';
// RNFirebase's dangerous mod injects this before AppDelegate mods run. Keep
// its initialization in didFinish; other inserted startup code stays rejected.
const FIREBASE_INITIALIZATION =
  /\/\/ @generated begin @react-native-firebase\/app-didFinishLaunchingWithOptions - expo prebuild \(DO NOT MODIFY\) sync-[a-f0-9]{40}\r?\n[ \t]*FirebaseApp\.configure\(\)\r?\n[ \t]*\/\/ @generated end @react-native-firebase\/app-didFinishLaunchingWithOptions/;
const WINDOW_START = new RegExp(
  String.raw`#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*(${FIREBASE_INITIALIZATION.source})?\s*factory\.startReactNative\(\s+withModuleName: "main",\s+in: window,\s+launchOptions: launchOptions\)\s+#endif`,
);

function migrateAppDelegate(contents, language = 'swift') {
  if (language !== 'swift') {
    throw new Error(
      'iOS Scene lifecycle requires the Expo SDK 55 Swift AppDelegate.',
    );
  }
  if (contents.includes(`// @generated begin ${TAG}`)) return contents;
  if (
    !WINDOW_START.test(contents) ||
    !contents.includes('var reactNativeFactory: RCTReactNativeFactory?') ||
    !contents.includes('    let delegate = ReactNativeDelegate()')
  ) {
    throw new Error(
      'Unrecognized AppDelegate: review the iOS Scene lifecycle plugin before changing the Expo template.',
    );
  }
  const sceneDelegate = fs.readFileSync(
    path.join(__dirname, 'ios/ZhihuSceneDelegate.swift'),
    'utf8',
  );
  return `${contents
    .replace(
      'var reactNativeFactory: RCTReactNativeFactory?',
      'var reactNativeFactory: RCTReactNativeFactory?\n  var zhihuLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?',
    )
    .replace(
      '    let delegate = ReactNativeDelegate()',
      '    zhihuLaunchOptions = launchOptions\n    let delegate = ReactNativeDelegate()',
    )
    .replace(WINDOW_START, (_startup, firebaseInitialization) =>
      firebaseInitialization
        ? `#if os(iOS) || os(tvOS)\n${firebaseInitialization}\n#endif\n    // The SceneDelegate creates the window and starts React Native.`
        : '// The SceneDelegate creates the window and starts React Native.',
    )}
// @generated begin ${TAG}
${sceneDelegate}
// @generated end ${TAG}
`;
}

function sceneManifest(existing) {
  const configurations = existing?.UISceneConfigurations;
  const applicationScenes = configurations?.UIWindowSceneSessionRoleApplication;
  const scene = applicationScenes?.[0];
  if (
    existing &&
    (existing.UIApplicationSupportsMultipleScenes !== false ||
      Object.keys(configurations ?? {}).length !== 1 ||
      applicationScenes?.length !== 1 ||
      scene?.UISceneDelegateClassName !== SCENE_CLASS ||
      scene?.UISceneConfigurationName !== 'Default Configuration' ||
      Object.keys(scene).length !== 2 ||
      Object.keys(existing).length !== 2)
  ) {
    throw new Error('An existing iOS Scene manifest needs manual migration.');
  }
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: SCENE_CLASS,
        },
      ],
    },
  };
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = sceneManifest(
      plistConfig.modResults.UIApplicationSceneManifest,
    );
    return plistConfig;
  });
  return withAppDelegate(config, (delegateConfig) => {
    delegateConfig.modResults.contents = migrateAppDelegate(
      delegateConfig.modResults.contents,
      delegateConfig.modResults.language,
    );
    return delegateConfig;
  });
}

module.exports = withIosSceneLifecycle;
module.exports.migrateAppDelegate = migrateAppDelegate;
module.exports.sceneManifest = sceneManifest;
