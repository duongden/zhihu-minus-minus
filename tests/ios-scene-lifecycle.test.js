const withIosSceneLifecycle = require('../plugins/withIosSceneLifecycle');
// Exercise the actual installed config-plugin transform, including its markers.
const {
  modifySwiftAppDelegate,
} = require('../node_modules/@react-native-firebase/app/plugin/build/ios/appDelegate');

// Keep this fixture independent of the ignored ios/ directory: CI starts from
// Expo SDK 55's generated app delegate, before the scene migration runs.
const SDK_55_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

const { migrateAppDelegate, sceneManifest } = withIosSceneLifecycle;

describe('iOS scene lifecycle app delegate migration', () => {
  test('moves window startup out of didFinish while retaining the Expo factory', () => {
    const migrated = migrateAppDelegate(SDK_55_APP_DELEGATE);
    const appDelegate = migrated.slice(
      0,
      migrated.indexOf('class ReactNativeDelegate'),
    );

    expect(appDelegate).toContain('reactNativeFactory = factory');
    expect(appDelegate).toContain('reactNativeDelegate = delegate');
    expect(appDelegate).toContain('delegate.dependencyProvider');
    expect(appDelegate).not.toContain('startReactNative(');
    expect(migrated).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(appDelegate).toMatch(/var zhihuLaunchOptions\s*:/);
    expect(appDelegate).toMatch(/zhihuLaunchOptions\s*=\s*launchOptions/);
    expect(appDelegate).toContain(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
    );
    expect(migrated).toContain('class ZhihuSceneDelegate');
  });

  test('preserves both existing link callbacks and their forwarding behavior', () => {
    const linkingMethods = SDK_55_APP_DELEGATE.slice(
      SDK_55_APP_DELEGATE.indexOf('  // Linking API'),
      SDK_55_APP_DELEGATE.indexOf('\nclass ReactNativeDelegate'),
    );

    expect(migrateAppDelegate(SDK_55_APP_DELEGATE)).toContain(linkingMethods);
  });

  test('preserves other config plugin code and Debug / Release bundle selection', () => {
    const startupHook = `    // @generated begin another-native-hook
    StartupObserver.configure(application)
    // @generated end another-native-hook
`;
    const factoryCustomization = `  override func customize(_ rootView: UIView) {
    super.customize(rootView)
    rootView.accessibilityIdentifier = "custom-root"
  }
`;
    const customized = SDK_55_APP_DELEGATE.replace(
      '    let delegate = ReactNativeDelegate()\n',
      `${startupHook}    let delegate = ReactNativeDelegate()\n`,
    ).replace(
      '  // Extension point for config-plugins\n',
      `  // Extension point for config-plugins\n${factoryCustomization}`,
    );
    const migrated = migrateAppDelegate(customized);

    expect(migrated).toContain(startupHook);
    expect(migrated).toContain(factoryCustomization);
    expect(migrated).toContain(
      'RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")',
    );
    expect(migrated).toContain(
      'Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
    );
  });

  test('can be applied repeatedly without adding another startup path', () => {
    const once = migrateAppDelegate(SDK_55_APP_DELEGATE);

    expect(once).toContain('zhihu-ios-scene-lifecycle');
    expect(migrateAppDelegate(once)).toBe(once);
    expect((once.match(/class ZhihuSceneDelegate\b/g) ?? []).length).toBe(1);
  });

  test('retains Firebase initialization from the real plugin in didFinish before Scene startup', () => {
    const configured = modifySwiftAppDelegate(SDK_55_APP_DELEGATE);
    const firebaseBlock = configured.slice(
      configured.indexOf(
        '// @generated begin @react-native-firebase/app-didFinishLaunchingWithOptions',
      ),
      configured.indexOf('    factory.startReactNative('),
    );
    const migrated = migrateAppDelegate(configured);
    const appDelegate = migrated.slice(
      0,
      migrated.indexOf('class ReactNativeDelegate'),
    );
    const sceneDelegate = migrated.slice(
      migrated.indexOf('// @generated begin zhihu-ios-scene-lifecycle'),
    );

    expect(appDelegate).toContain('import FirebaseCore');
    expect(appDelegate).toContain(firebaseBlock.trimEnd());
    expect(appDelegate).toMatch(
      /#if os\(iOS\) \|\| os\(tvOS\)[\s\S]*FirebaseApp\.configure\(\)[\s\S]*#endif/,
    );
    expect(appDelegate).not.toContain('startReactNative(');
    expect(sceneDelegate).not.toContain('FirebaseApp.configure()');
    expect(migrated).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect((migrated.match(/FirebaseApp\.configure\(\)/g) ?? []).length).toBe(
      1,
    );
    expect((migrated.match(/factory\.startReactNative\(/g) ?? []).length).toBe(
      1,
    );
  });

  test('keeps both Firebase and Scene migrations idempotent with telemetry enabled', () => {
    const once = migrateAppDelegate(
      modifySwiftAppDelegate(SDK_55_APP_DELEGATE),
    );

    expect(modifySwiftAppDelegate(once)).toBe(once);
    expect(migrateAppDelegate(modifySwiftAppDelegate(once))).toBe(once);
  });

  test('rejects unknown initialization beside the recognized Firebase block', () => {
    const configured = modifySwiftAppDelegate(SDK_55_APP_DELEGATE).replace(
      '    factory.startReactNative(',
      '    CustomStartup.configure()\n    factory.startReactNative(',
    );

    expect(() => migrateAppDelegate(configured)).toThrow(
      'Unrecognized AppDelegate',
    );
  });

  test('rejects a generated Firebase block whose initialization was customized', () => {
    const configured = modifySwiftAppDelegate(SDK_55_APP_DELEGATE).replace(
      'FirebaseApp.configure()',
      'FirebaseApp.configure(options: customOptions)',
    );

    expect(() => migrateAppDelegate(configured)).toThrow(
      'Unrecognized AppDelegate',
    );
  });

  test('rejects an unrecognized native template instead of partially rewriting it', () => {
    const customStartup = SDK_55_APP_DELEGATE.replace(
      '    window = UIWindow(frame: UIScreen.main.bounds)',
      '    window = CustomWindowProvider.makeWindow()',
    );

    expect(() => migrateAppDelegate(customStartup)).toThrow();
    expect(() =>
      migrateAppDelegate('class AppDelegate: NSObject {}'),
    ).toThrow();
  });

  test('rejects non-Swift app delegates', () => {
    expect(() => migrateAppDelegate(SDK_55_APP_DELEGATE, 'objc')).toThrow();
  });
});

describe('iOS scene manifest migration', () => {
  test('declares a single scene with the matching Objective-C class name', () => {
    const manifest = sceneManifest();

    expect(manifest.UIApplicationSupportsMultipleScenes).toBe(false);
    expect(Object.keys(manifest.UISceneConfigurations)).toEqual([
      'UIWindowSceneSessionRoleApplication',
    ]);
    const configurations =
      manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
    expect(configurations).toHaveLength(1);
    expect(configurations[0].UISceneDelegateClassName).toBe(
      'ZhihuSceneDelegate',
    );
    expect(configurations[0].UISceneStoryboardFile).toBeUndefined();
  });

  test('accepts its own existing manifest without changing it', () => {
    const manifest = sceneManifest();
    const original = JSON.stringify(manifest);

    expect(sceneManifest(manifest)).toEqual(manifest);
    expect(JSON.stringify(manifest)).toBe(original);
  });

  test('does not overwrite a custom scene delegate', () => {
    const custom = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Custom reader',
            UISceneDelegateClassName:
              '$(PRODUCT_MODULE_NAME).ReaderSceneDelegate',
          },
        ],
      },
    };
    const original = JSON.stringify(custom);

    expect(() => sceneManifest(custom)).toThrow();
    expect(JSON.stringify(custom)).toBe(original);
  });

  test('rejects multiple scene support rather than sharing one React host across windows', () => {
    const multipleScenes = {
      ...sceneManifest(),
      UIApplicationSupportsMultipleScenes: true,
    };

    expect(() => sceneManifest(multipleScenes)).toThrow();
  });

  test('does not collapse multiple application scene configurations', () => {
    const existing = sceneManifest();
    existing.UISceneConfigurations.UIWindowSceneSessionRoleApplication.push({
      UISceneConfigurationName: 'Secondary reader',
      UISceneDelegateClassName: 'ZhihuSceneDelegate',
    });
    const original = JSON.stringify(existing);

    expect(() => sceneManifest(existing)).toThrow();
    expect(JSON.stringify(existing)).toBe(original);
  });

  test('does not remove a custom storyboard from an existing scene', () => {
    const existing = sceneManifest();
    existing.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneStoryboardFile =
      'Reader';
    const original = JSON.stringify(existing);

    expect(() => sceneManifest(existing)).toThrow();
    expect(JSON.stringify(existing)).toBe(original);
  });
});
