import UIKit
import React
import React_RCTAppDelegate

/// The app as a whole. Its window and React Native are made in SceneDelegate.swift (the UIScene
/// life cycle).
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Background alert checks must be registered before launch finishes (FSAlertScheduler.mm).
    FSAlertScheduler.registerBackgroundTask()
    return true
  }

  // Rain warnings by push notification: FSAlertScheduler registers the token with the server.
  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    FSAlertScheduler.didRegisterForPush(deviceToken: deviceToken)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("FloodShield: no push token: %@", error.localizedDescription)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  // The logo of the launch screen stays until the first screen is drawn, on a slow phone too:
  // without it iOS shows an empty screen (black in dark mode) while the app's JavaScript starts.
  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    rootView.backgroundColor = .white
    if let launch = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view {
      rootView.loadingView = launch
    }
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
