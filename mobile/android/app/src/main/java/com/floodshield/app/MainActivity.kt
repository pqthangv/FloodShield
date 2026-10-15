package com.floodshield.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Edge-to-edge on every Android version, the way Google Play checks for it. Android 15+ forces
   * it anyway; React Native then sets the same up itself (edgeToEdgeEnabled in gradle.properties),
   * so the screens look the same either way.
   *
   * The splash screen (LaunchTheme) shows the logo while the app opens; afterwards the same logo
   * stays in the window background (AppTheme) until React Native draws the first screen.
   *
   * null, not savedInstanceState: when Android closed the app in the background and the user comes
   * back, it would rebuild react-native-screens' screens from the saved state, and they refuse to
   * ("Unable to instantiate fragment ... ScreenStackFragment"): a crash on start. The screens come
   * from JavaScript anyway, so the app simply opens fresh. (The library's RNScreensFragmentFactory
   * spots its screens by class name, which R8 renames in release builds.)
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    enableEdgeToEdge()
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "FloodShield"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
