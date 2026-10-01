import UIKit

// SDK 55 still dispatches Expo subscribers through AppDelegate. Keep that path
// while giving UIKit a real scene-owned window, including cold-start links.
@objc(ZhihuSceneDelegate)
final class ZhihuSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let delegate = appDelegate,
          let factory = delegate.reactNativeFactory else { return }

    var launchOptions = delegate.zhihuLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      launchOptions[.sourceApplication] = context.options.sourceApplication
      launchOptions[.annotation] = context.options.annotation
    }
    if let activity = connectionOptions.userActivities.first(where: {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }) {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }

    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    delegate.window = sceneWindow
    factory.startReactNative(
      withModuleName: "main",
      in: sceneWindow,
      launchOptions: launchOptions)

    // Expo Linking also keeps an initial-URL registry. Populate it through the
    // existing delegate after its factory is ready, without a second RN path.
    for context in connectionOptions.urlContexts {
      open(context, with: delegate)
    }
    for activity in connectionOptions.userActivities {
      _ = delegate.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    guard let delegate = appDelegate else { return }
    for context in contexts {
      open(context, with: delegate)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let delegate = appDelegate else {
      completionHandler(false)
      return
    }
    delegate.application(
      UIApplication.shared,
      performActionFor: shortcutItem,
      completionHandler: completionHandler)
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    if appDelegate?.window === window {
      appDelegate?.window = nil
    }
    window = nil
  }

  private func open(_ context: UIOpenURLContext, with delegate: AppDelegate) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [
      .openInPlace: context.options.openInPlace
    ]
    options[.sourceApplication] = context.options.sourceApplication
    options[.annotation] = context.options.annotation
    _ = delegate.application(UIApplication.shared, open: context.url, options: options)
  }
}
