import SwiftUI

/// What the widget knows, saved in the App Group by the app (FSAlertScheduler.mm: setWidget, from
/// services/widget.ts) and by the background check. The same JSON as on Android (WidgetStore.kt).
struct Snapshot: Decodable {
  var place: String?
  var temperature: Double?
  var condition: String?
  /// The app's weather icon key: clear, cloudy, drizzle, rain, thunderstorm or snow.
  var icon: String?
  var isDay: Bool?
  /// km/h
  var windSpeed: Double?
  var feelsLike: Double?
  /// %
  var humidity: Double?
  /// nil: no successful check yet for this place (or the last one failed).
  var alerts: [SnapshotAlert]?
  /// When the alerts were checked, in ms since 1970.
  var checkedAt: Double?

  enum CodingKeys: String, CodingKey {
    case place, temperature, condition, icon, humidity, alerts
    case isDay = "is_day"
    case windSpeed = "wind_speed"
    case feelsLike = "apparent_temperature"
    case checkedAt = "checked_at"
  }
}

struct SnapshotAlert: Decodable {
  var title: String?
  var severity: String?
}

/// The App Group shared with the app (both targets' .entitlements).
enum WidgetData {
  static let kind = "FloodShieldWidget"
  /// Also read and written by WidgetFetch.swift (the widget refreshing itself).
  static let defaults = UserDefaults(suiteName: "group.com.floodshield.app")

  /// The language chosen in the app, not the phone's.
  static var language: String { defaults?.string(forKey: "fs_widget_language") ?? "vi" }

  /// The hidden widget test (Settings > Version, long press in the app).
  static var test: Bool { defaults?.bool(forKey: "fs_widget_test") ?? false }

  /// When iOS last asked the widget for its timeline (markShown), in seconds since 1970.
  static var shownAt: Double { defaults?.double(forKey: "fs_widget_seen_at") ?? 0 }

  static func load() -> Snapshot? {
    guard let json = defaults?.string(forKey: "fs_widget_snapshot"), let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
  }

  /// Tells the app's background check there is a widget to keep up to date (the weather is only
  /// fetched for one).
  static func markShown(_ date: Date) {
    defaults?.set(date.timeIntervalSince1970, forKey: "fs_widget_seen_at")
  }
}

/// The coloured band at the bottom of the widget.
enum Band {
  /// Not checked, the check failed, or it's too old: neither a warning nor "all clear".
  case unknown
  case clear
  /// The most serious warning, and how many others there are.
  case warning(title: String, severity: String, others: Int)
}

/// The background check runs when iOS allows it; a few hours without one is normal.
let staleAfter: TimeInterval = 3 * 60 * 60

/// Like the app's green card (and WidgetState.kt on Android), "all clear" only after a recent
/// check that worked: an old answer may hide a warning that came since. A warning that old is not
/// shown either, since it may be over: the band then asks to open the app.
func bandFor(_ snapshot: Snapshot?, now: Date) -> Band {
  guard let alerts = snapshot?.alerts, let checkedAt = snapshot?.checkedAt, checkedAt > 0 else {
    return .unknown
  }
  let age = now.timeIntervalSince1970 - checkedAt / 1000
  // A phone clock set back a little shouldn't make a fresh check look like it's from the future.
  if age > staleAfter || age < -10 * 60 {
    return .unknown
  }
  let order = ["info", "moderate", "high", "severe"]
  let rank = { (alert: SnapshotAlert) in order.firstIndex(of: alert.severity ?? "") ?? -1 }
  // max(by:) keeps the first of equals, so the server's order wins.
  guard let top = alerts.max(by: { rank($0) < rank($1) }) else {
    return .clear
  }
  return .warning(title: top.title ?? "", severity: top.severity ?? "", others: alerts.count - 1)
}

/// The widget's own texts, in the app's language (the rest comes translated in the snapshot).
struct Texts {
  let vi: Bool

  init(language: String) {
    vi = language == "vi"
  }

  /// The widget gallery speaks the phone's language.
  static var phone: Texts {
    Texts(language: Locale.preferredLanguages.first?.hasPrefix("vi") == true ? "vi" : "en")
  }

  var noAlerts: String { vi ? "Không có cảnh báo cho khu vực của bạn" : "No alerts for your area" }
  var noAlertsShort: String { vi ? "Không có cảnh báo" : "No alerts" }
  var openApp: String { vi ? "Mở ứng dụng để cập nhật" : "Open the app to update" }
  var wind: String { vi ? "Gió" : "Wind" }
  var feelsLike: String { vi ? "Cảm thấy" : "Feels like" }
  var humidity: String { vi ? "Độ ẩm" : "Humidity" }
  var galleryDescription: String {
    vi ? "Thời tiết và cảnh báo thiên tai nơi bạn ở" : "Weather and disaster warnings where you are"
  }

  func updated(_ time: String) -> String { vi ? "Cập nhật \(time)" : "Updated \(time)" }

  func severity(_ severity: String) -> String {
    switch severity {
    case "info": return vi ? "Theo dõi" : "Watch"
    case "moderate": return vi ? "Cảnh báo" : "Warning"
    case "severe": return vi ? "Rất nguy hiểm" : "Very dangerous"
    default: return vi ? "Nguy hiểm" : "Dangerous"
    }
  }
}

/// The app's colours (Android: res/drawable/widget_*.xml).
enum Palette {
  static let card = Color(hex: 0xC9E5FF)
  static let navy = Color(hex: 0x1F2D54)
  static let grey = Color(hex: 0x5A6E8C)
  static let clear = Color(hex: 0x2E7D32)

  static func band(_ severity: String) -> Color {
    switch severity {
    case "info": return Color(hex: 0x4A90D9)
    case "moderate": return Color(hex: 0xFFA500)
    case "severe": return Color(hex: 0xD50000)
    default: return Color(hex: 0xF4511E)
    }
  }
}

extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255)
  }
}

/// The app's weather pictures (components/WeatherIcon.tsx), exported to Assets.xcassets.
func weatherImageName(_ icon: String?, isDay: Bool) -> String {
  let time = isDay ? "day" : "night"
  switch icon {
  case "clear": return "weather_clear_\(time)"
  case "drizzle": return "weather_drizzle_\(time)"
  case "rain": return "weather_rain"
  case "thunderstorm": return "weather_thunderstorm_\(time)"
  case "snow": return "weather_snow"
  default: return "weather_cloudy_\(time)"
  }
}
