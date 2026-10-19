import Foundation

// Keep equal to services/openMeteo.ts, AlertWorker.kt, FSAlertScheduler.mm and
// backend/services/weather.py (backend/tests/test_app_sync.py checks, and finds them by these
// upper-case names, as in the other copies).
private let FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
private let CURRENT_VARS =
  "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,"
  + "weather_code,wind_speed_10m,wind_gusts_10m"
private let HOURLY_VARS =
  "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,"
  + "wind_gusts_10m"
private let DAILY_VARS =
  "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,"
  + "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,"
  + "sunrise,sunset"
/// ~1 km (ward level), like the app (services/openMeteo.ts).
private let SNAP_STEP = 0.01
// Keep equal to services/glofas.ts, AlertWorker.kt, FSAlertScheduler.mm and
// backend/services/flood.py (the same test checks).
private let FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
private let FORECAST_VARS = "river_discharge,river_discharge_p25,river_discharge_p75"
private let PAST_DAYS = 3
private let FORECAST_DAYS = 16

/// The App Group keys: what FSAlertScheduler.mm writes for the widget (configure, setRiver), and
/// what the widget keeps about its own refreshes.
private enum Key {
  static let apiBase = "fs_widget_api_base"
  static let latitude = "fs_widget_latitude"
  static let longitude = "fs_widget_longitude"
  static let alertsOn = "fs_widget_alerts_on"
  static let river = "fs_widget_river"
  static let snapshot = "fs_widget_snapshot"
  static let triedAt = "fs_widget_tried_at"
  static let refreshAt = "fs_widget_refresh_at"
  static let refreshResult = "fs_widget_refresh_result"
}

/// The widget refreshing its data itself, so it isn't hours old: iOS wakes a home-screen widget
/// far more often than it runs the app's background check. The same steps as that check
/// (FSAlertScheduler.mm runCheck), without notifications: those stay with the app and the rain
/// pushes. Like the background check, only while alerts are on in the app's Settings.
enum WidgetFetch {
  /// A check newer than this (by the app, its background check or the widget) is kept.
  static let freshFor: TimeInterval = 20 * 60
  /// After a try, wait at least this long (offline, server down, or both widget sizes waking).
  static let retryAfter: TimeInterval = 10 * 60
  /// Each of the two steps (the downloads, then the server): a widget only has a short time.
  static let stepTimeout: TimeInterval = 12

  private struct Answer {
    /// 0: no answer (offline, timeout).
    let status: Int
    let data: Data?
  }

  /// Refreshes the saved snapshot when it's due. Never throws; the hidden test shows what
  /// happened.
  static func refreshIfDue(now: Date = Date()) async {
    guard let defaults = WidgetData.defaults, waiting() == nil,
      let base = defaults.string(forKey: Key.apiBase)
    else { return }
    let checkedAt = (WidgetData.load()?.checkedAt ?? 0) / 1000
    let sinceTry = now.timeIntervalSince1970 - defaults.double(forKey: Key.triedAt)
    // A clock set back a little doesn't make a check look new for long (bandFor allows 10 min).
    let sinceCheck = now.timeIntervalSince1970 - checkedAt
    if (sinceCheck >= -10 * 60 && sinceCheck < freshFor) || (sinceTry >= 0 && sinceTry < retryAfter) {
      return
    }
    defaults.set(now.timeIntervalSince1970, forKey: Key.triedAt)
    let latitude = defaults.double(forKey: Key.latitude)
    let longitude = defaults.double(forKey: Key.longitude)
    let language = WidgetData.language
    let savedRiver = defaults.string(forKey: Key.river)

    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = stepTimeout
    config.timeoutIntervalForResource = stepTimeout
    config.httpAdditionalHeaders = ["User-Agent": userAgent, "Accept": "application/json"]
    let session = URLSession(configuration: config)
    defer { session.finishTasksAndInvalidate() }

    // 1. The forecast and the river's forecast, both from Open-Meteo, at the same time.
    async let forecastDownload = fetchForecast(session, latitude, longitude)
    async let riverDownload = fetchRiver(session, savedRiver, latitude, longitude)
    let forecast = await forecastDownload
    let river = await riverDownload

    // 2. The server turns them into alerts (POST /alerts) and gives the weather now (POST
    // /weather), from the same forecast, at the same time.
    var alertsAnswer: Answer?
    var weatherAnswer: Answer?
    if let forecastData = forecast.data, let forecastObject = try? JSONSerialization.jsonObject(with: forecastData) {
      var payload: [String: Any] = ["latitude": latitude, "longitude": longitude, "forecast": forecastObject]
      if let riverData = river.data, let riverObject = try? JSONSerialization.jsonObject(with: riverData) {
        payload["flood"] = riverObject
      }
      let alertsBody = try? JSONSerialization.data(withJSONObject: payload)
      let weatherBody = try? JSONSerialization.data(
        withJSONObject: ["latitude": latitude, "longitude": longitude, "forecast": forecastObject])
      async let postAlerts = send(session, URL(string: base + "/alerts"), body: alertsBody, language: language)
      async let postWeather = send(session, URL(string: base + "/weather"), body: weatherBody, language: language)
      alertsAnswer = await postAlerts
      weatherAnswer = await postWeather
    }
    // No forecast, or an older server without the POST route, or rejected data: the server
    // fetches itself.
    var askedServer = false
    let refused = alertsAnswer.map { [404, 405, 422].contains($0.status) } ?? true
    if refused {
      askedServer = true
      let url = URL(string: String(format: "%@/alerts?lat=%f&lon=%f", base, latitude, longitude))
      alertsAnswer = await send(session, url, language: language)
    }

    var alerts: [Any]?
    if let answer = alertsAnswer, let json = object(answer) {
      alerts = json["alerts"] as? [Any]
    }
    var weather: [String: Any]?
    if let answer = weatherAnswer {
      weather = object(answer)
    }
    save(alerts: alerts, weather: weather, now: Date())

    let riverText = river.status < 0 ? "-" : describe(river.status)
    let alertsText = describe(alertsAnswer?.status) + (askedServer ? " (GET)" : "")
    record(
      "forecast \(describe(forecast.status)), river \(riverText), alerts \(alertsText), "
        + "weather \(describe(weatherAnswer?.status))",
      at: now)
  }

  /// Why the widget doesn't refresh itself at all, or nil when it does.
  static func waiting() -> String? {
    guard let defaults = WidgetData.defaults else { return "no App Group" }
    let base = defaults.string(forKey: Key.apiBase) ?? ""
    let hasPlace = defaults.object(forKey: Key.latitude) != nil && defaults.object(forKey: Key.longitude) != nil
    if base.isEmpty || !hasPlace {
      return "waiting for the app to be opened once"
    }
    return defaults.bool(forKey: Key.alertsOn) ? nil : "alerts are off in Settings"
  }

  /// The hidden test's text over the widget (Settings > Version, long press in the app): when
  /// iOS last woke the widget, its last refresh and what happened, when the alerts were checked.
  static func testText() -> String {
    let defaults = WidgetData.defaults
    var lines = ["FloodShield test, woke \(clock(WidgetData.shownAt))"]
    if let why = waiting() {
      lines.append(why)
    }
    let refreshAt = defaults?.double(forKey: Key.refreshAt) ?? 0
    lines.append(
      refreshAt > 0
        ? "refresh \(clock(refreshAt)): \(defaults?.string(forKey: Key.refreshResult) ?? "")"
        : "no refresh yet")
    let checkedAt = (WidgetData.load()?.checkedAt ?? 0) / 1000
    lines.append(checkedAt > 0 ? "alerts checked \(clock(checkedAt))" : "alerts never checked")
    return lines.joined(separator: "\n")
  }

  // MARK: - The steps

  private static func fetchForecast(_ session: URLSession, _ latitude: Double, _ longitude: Double) async -> Answer {
    let url = URL(
      string: String(
        format: "%@?latitude=%.4f&longitude=%.4f&current=%@&hourly=%@&daily=%@"
          + "&timezone=auto&forecast_days=7&wind_speed_unit=kmh",
        FORECAST_URL, snap(latitude), snap(longitude), CURRENT_VARS, HOURLY_VARS, DAILY_VARS))
    let answer = await send(session, url)
    // Only a real forecast counts.
    return object(answer) != nil ? answer : Answer(status: answer.status == 200 ? 0 : answer.status, data: nil)
  }

  /// The river the app found near this place, with its forecast downloaded now, as POST /alerts
  /// takes it (FSAlertScheduler.mm riverNearLatitude). status -1: none saved for this place.
  private static func fetchRiver(_ session: URLSession, _ saved: String?, _ latitude: Double, _ longitude: Double)
    async -> Answer
  {
    let none = Answer(status: -1, data: nil)
    // Only for the place it was found for: the user may have moved since.
    guard let saved, let savedData = saved.data(using: .utf8),
      let river = (try? JSONSerialization.jsonObject(with: savedData)) as? [String: Any],
      let riverLatitude = river["latitude"] as? Double, let riverLongitude = river["longitude"] as? Double,
      abs(riverLatitude - latitude) < 0.05, abs(riverLongitude - longitude) < 0.05
    else { return none }
    if river["cell"] is NSNull {
      // No river nearby.
      return Answer(status: 200, data: try? JSONSerialization.data(withJSONObject: ["cell": NSNull()]))
    }
    guard let cell = river["cell"] as? [String: Any], let cellLatitude = cell["latitude"] as? NSNumber,
      let cellLongitude = cell["longitude"] as? NSNumber
    else { return none }
    let url = URL(
      string: "\(FLOOD_URL)?latitude=\(cellLatitude.stringValue)&longitude=\(cellLongitude.stringValue)"
        + "&daily=\(FORECAST_VARS)&past_days=\(PAST_DAYS)&forecast_days=\(FORECAST_DAYS)")
    let answer = await send(session, url)
    guard let daily = object(answer)?["daily"] as? [String: Any] else {
      return Answer(status: answer.status == 200 ? 0 : answer.status, data: nil)
    }
    let flood: [String: Any] = ["cell": cell, "forecast": daily, "annual_maxima": river["annual_maxima"] as? [Any] ?? []]
    return Answer(status: 200, data: try? JSONSerialization.data(withJSONObject: flood))
  }

  /// Like FSAlertScheduler.mm saveWidgetAlerts and saveWidgetWeather: the new parts over the saved
  /// snapshot. The app's place label (a city the user picked, in its language) wins over the
  /// server's. Not FSReloadWidgets: this is the widget, drawing right after.
  private static func save(alerts: [Any]?, weather: [String: Any]?, now: Date) {
    guard alerts != nil || weather != nil, let defaults = WidgetData.defaults else { return }
    var snapshot: [String: Any] = [:]
    if let saved = defaults.string(forKey: Key.snapshot)?.data(using: .utf8),
      let old = (try? JSONSerialization.jsonObject(with: saved)) as? [String: Any]
    {
      snapshot = old
    }
    if let alerts {
      snapshot["alerts"] = alerts.compactMap { $0 as? [String: Any] }.map { alert -> [String: String] in
        ["title": alert["title"] as? String ?? "", "severity": alert["severity"] as? String ?? ""]
      }
      snapshot["checked_at"] = (now.timeIntervalSince1970 * 1000).rounded(.down)
    }
    if let weather, let current = weather["current"] as? [String: Any] {
      let place = snapshot["place"] as? String ?? ""
      if place.isEmpty, let name = (weather["location"] as? [String: Any])?["name"] as? String, !name.isEmpty {
        snapshot["place"] = name
      }
      for key in ["temperature", "condition", "icon", "is_day", "wind_speed", "apparent_temperature", "humidity"] {
        if let value = current[key], !(value is NSNull) {
          snapshot[key] = value
        }
      }
      // The widget's short words (servers before 1.0.5 only send the long ones), as in the app.
      if let short = current["condition_short"] as? String, !short.isEmpty {
        snapshot["condition"] = short
      }
    }
    if let data = try? JSONSerialization.data(withJSONObject: snapshot), let json = String(data: data, encoding: .utf8) {
      defaults.set(json, forKey: Key.snapshot)
    }
  }

  // MARK: - Helpers

  private static func send(_ session: URLSession, _ url: URL?, body: Data? = nil, language: String? = nil) async
    -> Answer
  {
    guard let url else { return Answer(status: 0, data: nil) }
    var request = URLRequest(url: url, timeoutInterval: stepTimeout)
    if let language {
      // Warnings and the place name in the language chosen in the app.
      request.setValue(language, forHTTPHeaderField: "Accept-Language")
    }
    if let body {
      request.httpMethod = "POST"
      request.httpBody = body
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    do {
      let (data, response) = try await session.data(for: request)
      return Answer(status: (response as? HTTPURLResponse)?.statusCode ?? 0, data: data)
    } catch {
      return Answer(status: 0, data: nil)
    }
  }

  /// The JSON object of a 2xx answer, or nil.
  private static func object(_ answer: Answer) -> [String: Any]? {
    guard (200..<300).contains(answer.status), let data = answer.data else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  /// "-" not asked, "ok", "no answer" (offline, timeout), or the HTTP status.
  private static func describe(_ status: Int?) -> String {
    guard let status else { return "-" }
    if status == 0 {
      return "no answer"
    }
    return (200..<300).contains(status) ? "ok" : String(status)
  }

  private static func record(_ result: String, at date: Date) {
    WidgetData.defaults?.set(date.timeIntervalSince1970, forKey: Key.refreshAt)
    WidgetData.defaults?.set(result, forKey: Key.refreshResult)
  }

  private static func snap(_ value: Double) -> Double {
    (round(value / SNAP_STEP) * SNAP_STEP * 10000).rounded() / 10000
  }

  private static func clock(_ seconds: Double) -> String {
    guard seconds > 0 else { return "never" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "HH:mm:ss"
    return formatter.string(from: Date(timeIntervalSince1970: seconds))
  }

  private static var userAgent: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    return "FloodShield/\(version) (iOS widget; https://github.com/pqthangv/FloodShield)"
  }
}
