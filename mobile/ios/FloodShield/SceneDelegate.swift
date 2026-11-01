import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

/// The app's window and React Native in it. Apps built with Xcode 27 must make their window here
/// (the UIScene life cycle, Info.plist UIApplicationSceneManifest), not in the app delegate, or iOS
/// doesn't open them; it also lets the window follow the iPhone Duo's two screens. Like React
/// Native 0.88's template. The background checks and push stay in AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(windowScene: windowScene)

    // No launch options: the app opens no links, and notification taps go to
    // FSAlertScheduler's notification-center delegate.
    factory.startReactNative(
      withModuleName: "FloodShield",
      in: window,
      launchOptions: nil
    )
  }
}
