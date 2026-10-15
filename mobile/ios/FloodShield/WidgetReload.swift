import WidgetKit

/// Redraws the home-screen widget after FSAlertScheduler.mm saved new data for it. A C function,
/// because WidgetKit can only be used from Swift.
@_cdecl("FSReloadWidgets")
public func FSReloadWidgets() {
  WidgetCenter.shared.reloadAllTimelines()
}
