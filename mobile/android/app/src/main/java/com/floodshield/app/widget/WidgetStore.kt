package com.floodshield.app.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The widget's snapshot (WidgetState.kt), kept as JSON. The app sends the same JSON
 * (services/widget.ts); the background check fills in the alerts, and the weather when there is a
 * widget to show it.
 */
class WidgetStore(context: Context) {
  private val prefs = context.getSharedPreferences("floodshield_widget", Context.MODE_PRIVATE)

  fun load(): Snapshot? = prefs.getString(KEY, null)?.let { runCatching { parse(JSONObject(it)) }.getOrNull() }

  /**
   * From the app: what it shows now. A part it couldn't load (null) keeps the saved one, except
   * the alerts of another place.
   */
  fun saveFromApp(json: String) {
    val update = parse(JSONObject(json))
    val old = load()
    val samePlace = old?.place == null || update.place == null || old.place == update.place
    // The weather comes as a whole: without a temperature, nothing of it loaded.
    val weather = if (update.temperature != null || old == null) update else old
    save(
        Snapshot(
            place = update.place ?: old?.place,
            temperature = weather.temperature,
            condition = weather.condition,
            icon = weather.icon,
            isDay = weather.isDay,
            windSpeed = weather.windSpeed,
            feelsLike = weather.feelsLike,
            humidity = weather.humidity,
            alerts = update.alerts ?: old?.alerts?.takeIf { samePlace },
            checkedAt = if (update.alerts != null) update.checkedAt else if (samePlace) old?.checkedAt ?: 0 else 0,
        ))
  }

  /** From the background check: the alerts it just got, now. */
  fun saveAlerts(alerts: JSONArray, now: Long) {
    val old = load() ?: Snapshot()
    save(old.copy(alerts = alertsOf(alerts), checkedAt = now))
  }

  /** From the background check: POST /weather's answer (current weather and place name). */
  fun saveWeather(weather: JSONObject) {
    val current = weather.optJSONObject("current") ?: return
    val old = load() ?: Snapshot()
    save(
        old.copy(
            // The app's label (a city the user picked, in their language) wins over the server's.
            place = old.place ?: weather.optJSONObject("location")?.optString("name")?.ifEmpty { null },
            temperature = number(current, "temperature") ?: old.temperature,
            // The widget's short words (servers before 1.0.5 only send the long ones).
            condition =
                current.optString("condition_short").ifEmpty { current.optString("condition") }.ifEmpty {
                  old.condition
                },
            icon = current.optString("icon").ifEmpty { old.icon },
            isDay = current.optBoolean("is_day", old.isDay),
            windSpeed = number(current, "wind_speed") ?: old.windSpeed,
            feelsLike = number(current, "apparent_temperature") ?: old.feelsLike,
            humidity = number(current, "humidity") ?: old.humidity,
        ))
  }

  private fun save(snapshot: Snapshot) {
    val json =
        JSONObject()
            .put("place", snapshot.place)
            .put("temperature", snapshot.temperature)
            .put("condition", snapshot.condition)
            .put("icon", snapshot.icon)
            .put("is_day", snapshot.isDay)
            .put("wind_speed", snapshot.windSpeed)
            .put("apparent_temperature", snapshot.feelsLike)
            .put("humidity", snapshot.humidity)
            .put("checked_at", snapshot.checkedAt)
    snapshot.alerts?.let { list ->
      json.put(
          "alerts",
          JSONArray().apply { list.forEach { put(JSONObject().put("title", it.title).put("severity", it.severity)) } })
    }
    prefs.edit().putString(KEY, json.toString()).apply()
  }

  private fun parse(json: JSONObject) =
      Snapshot(
          place = json.optString("place").ifEmpty { null }.takeUnless { json.isNull("place") },
          temperature = number(json, "temperature"),
          condition = json.optString("condition").ifEmpty { null }.takeUnless { json.isNull("condition") },
          icon = json.optString("icon").ifEmpty { null }.takeUnless { json.isNull("icon") },
          isDay = json.optBoolean("is_day", true),
          windSpeed = number(json, "wind_speed"),
          feelsLike = number(json, "apparent_temperature"),
          humidity = number(json, "humidity"),
          alerts = if (json.isNull("alerts")) null else json.optJSONArray("alerts")?.let(::alertsOf),
          checkedAt = json.optLong("checked_at", 0),
      )

  private fun number(json: JSONObject, key: String) =
      if (json.isNull(key)) null else json.optDouble(key).takeUnless { it.isNaN() }

  private fun alertsOf(array: JSONArray) =
      (0 until array.length()).map { i ->
        val alert = array.getJSONObject(i)
        SnapshotAlert(alert.optString("title"), alert.optString("severity"))
      }

  companion object {
    private const val KEY = "snapshot"
  }
}
