package com.zhihuminus.appicon

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZhihuAppIconModule : Module() {
  private val aliases = linkedMapOf(
    "default" to "AppIconDefaultAlias",
    "indigo" to "AppIconIndigoAlias",
    "mint" to "AppIconMintAlias",
    "emerald" to "AppIconEmeraldAlias",
    "sunset" to "AppIconSunsetAlias",
    "sakura" to "AppIconSakuraAlias",
    "peach" to "AppIconPeachAlias",
    "rose" to "AppIconRoseAlias",
    "violet" to "AppIconVioletAlias",
    "slate" to "AppIconSlateAlias",
    "aurora" to "AppIconAuroraAlias",
    "rainbow" to "AppIconRainbowAlias"
  )

  private val context: Context
    get() = requireNotNull(appContext.reactContext) {
      "React application context is unavailable."
    }

  override fun definition() = ModuleDefinition {
    Name("ZhihuAppIcon")

    AsyncFunction("isSupported") {
      true
    }

    AsyncFunction("getAppIcon") {
      currentIconName()
    }

    AsyncFunction("setAppIcon") { iconName: String ->
      val selectedAlias = aliases[iconName]
        ?: throw IllegalArgumentException("Unknown app icon: $iconName")
      val packageManager = context.packageManager
      val packageName = context.packageName

      packageManager.setComponentEnabledSetting(
        ComponentName(packageName, "$packageName.$selectedAlias"),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP
      )

      for ((_, alias) in aliases) {
        if (alias == selectedAlias) continue
        packageManager.setComponentEnabledSetting(
          ComponentName(packageName, "$packageName.$alias"),
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP
        )
      }
      iconName
    }
  }

  private fun currentIconName(): String {
    val packageManager = context.packageManager
    val packageName = context.packageName
    for ((iconName, alias) in aliases) {
      val component = ComponentName(packageName, "$packageName.$alias")
      val state = packageManager.getComponentEnabledSetting(component)
      if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return iconName
      if (
        iconName == "default" &&
        state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT
      ) {
        return iconName
      }
    }
    return "default"
  }
}
