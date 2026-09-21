import ExpoModulesCore
import UIKit

public final class ZhihuAppIconModule: Module {
  private let iconNames: [String: String] = [
    "indigo": "ZhihuIconIndigo",
    "mint": "ZhihuIconMint",
    "emerald": "ZhihuIconEmerald",
    "sunset": "ZhihuIconSunset",
    "sakura": "ZhihuIconSakura",
    "peach": "ZhihuIconPeach",
    "rose": "ZhihuIconRose",
    "violet": "ZhihuIconViolet",
    "slate": "ZhihuIconSlate"
  ]

  public func definition() -> ModuleDefinition {
    Name("ZhihuAppIcon")

    AsyncFunction("isSupported") { (promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(UIApplication.shared.supportsAlternateIcons)
      }
    }

    AsyncFunction("getAppIcon") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let nativeName = UIApplication.shared.alternateIconName else {
          promise.resolve("default")
          return
        }
        let iconName = self.iconNames.first(where: { $0.value == nativeName })?.key ?? "default"
        promise.resolve(iconName)
      }
    }

    AsyncFunction("setAppIcon") { (iconName: String, promise: Promise) in
      DispatchQueue.main.async {
        guard UIApplication.shared.supportsAlternateIcons else {
          promise.reject("ERR_APP_ICON_UNSUPPORTED", "当前设备不支持切换 App 图标。")
          return
        }

        let nativeName: String?
        if iconName == "default" {
          nativeName = nil
        } else if let mappedName = self.iconNames[iconName] {
          nativeName = mappedName
        } else {
          promise.reject("ERR_APP_ICON_INVALID", "未知的 App 图标：\(iconName)")
          return
        }

        UIApplication.shared.setAlternateIconName(nativeName) { error in
          if let error {
            promise.reject(
              "ERR_APP_ICON_CHANGE",
              "无法切换 App 图标：\(error.localizedDescription)"
            )
          } else {
            promise.resolve(iconName)
          }
        }
      }
    }
  }
}
