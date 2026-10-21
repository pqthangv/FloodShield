package com.floodshield.app.alerts

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.floodshield.app.R
import com.floodshield.app.widget.WidgetRenderer
import com.floodshield.app.widget.WidgetStore
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/** Fetches alerts for the saved location and notifies the user about new ones. */
class AlertWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

  override fun doWork(): Result {
    val prefs = AlertPrefs(applicationContext)
    if (!prefs.enabled) return Result.success()
    val baseUrl = prefs.apiBaseUrl ?: return Result.success()
    val lat = prefs.latitude ?: return Result.success()
    val lon = prefs.longitude ?: return Result.success()

    // The phone downloads the forecast and the river data itself (see services/openMeteo.ts and
    // glofas.ts) and the server turns them into alerts. What the phone couldn't get, the server
    // tries to fetch itself.
    val forecast = fetchForecast(lat, lon)
    val alerts =
        try {
          (forecast?.let { postAlerts(baseUrl, lat, lon, it, fetchRiver(prefs.river, lat, lon), prefs.language) })
              ?: request("$baseUrl/alerts?lat=$lat&lon=$lon", prefs.language).alerts()
        } catch (e: IOException) {
          return Result.retry()
        } catch (e: Exception) {
          return Result.failure()
        }

    // The home-screen widget: these alerts, and the weather now when there is a widget to show it
    // (one more request, so only then). With alerts turned off this check doesn't run, and the
    // widget turns neutral after a few hours (WidgetState.kt) until the app is opened.
    val widget = WidgetStore(applicationContext)
    widget.saveAlerts(alerts, System.currentTimeMillis())
    if (forecast != null && WidgetRenderer.hasWidgets(applicationContext)) {
      postWeather(baseUrl, lat, lon, forecast, prefs.language)?.let(widget::saveWeather)
    }
    WidgetRenderer.updateAll(applicationContext)

    val seen = prefs.seenIds()
    for (i in 0 until alerts.length()) {
      val alert = alerts.getJSONObject(i)
      val id = alert.optString("id")
      val severity = alert.optString("severity")
      if (id.isEmpty() || id in seen || severity !in NOTIFY_SEVERITIES) continue
      notify(applicationContext, alert, severity)
      seen.add(id)
    }
    prefs.saveSeenIds(seen)
    // Keeps this phone known to the server for rain-warning pushes, even if the app isn't opened.
    PushRegistration.sync(applicationContext)
    return Result.success()
  }

  /** Raw Open-Meteo forecast for the location, or null if the phone can't get it. */
  private fun fetchForecast(lat: Double, lon: Double): JSONObject? {
    val url =
        "$FORECAST_URL?latitude=${snap(lat)}&longitude=${snap(lon)}&current=$CURRENT_VARS" +
            "&hourly=$HOURLY_VARS&daily=$DAILY_VARS&timezone=auto&forecast_days=7&wind_speed_unit=kmh"
    return try {
      val (code, body) = request(url, null, timeoutMs = 20_000)
      if (code in 200..299) JSONObject(body) else null
    } catch (e: Exception) {
      null
    }
  }

  /**
   * The river the app found here (setRiver) with its forecast downloaded now, as POST /alerts
   * takes it; null when there is none for this place or the download failed.
   */
  private fun fetchRiver(saved: String?, lat: Double, lon: Double): JSONObject? {
    return try {
      val river = JSONObject(saved ?: return null)
      // Only for the place it was found for: the user may have moved since.
      if (Math.abs(river.getDouble("latitude") - lat) >= 0.05 ||
          Math.abs(river.getDouble("longitude") - lon) >= 0.05 ||
          !river.has("cell")) return null
      if (river.isNull("cell")) return JSONObject().put("cell", JSONObject.NULL) // no river nearby
      val cell = river.getJSONObject("cell")
      val url =
          "$FLOOD_URL?latitude=${cell.getDouble("latitude")}&longitude=${cell.getDouble("longitude")}" +
              "&daily=$FORECAST_VARS&past_days=$PAST_DAYS&forecast_days=$FORECAST_DAYS"
      val (code, body) = request(url, null, timeoutMs = 20_000)
      if (code !in 200..299) return null
      JSONObject()
          .put("cell", cell)
          .put("forecast", JSONObject(body).getJSONObject("daily"))
          .put("annual_maxima", river.optJSONArray("annual_maxima") ?: JSONArray())
    } catch (e: Exception) {
      null
    }
  }

  /** Alerts from the phone's own data; null when the server can't take it (old or rejected). */
  private fun postAlerts(
      baseUrl: String,
      lat: Double,
      lon: Double,
      forecast: JSONObject,
      river: JSONObject?,
      language: String,
  ): JSONArray? {
    val body = JSONObject().put("latitude", lat).put("longitude", lon).put("forecast", forecast)
    river?.let { body.put("flood", it) }
    val response = request("$baseUrl/alerts", language, body.toString())
    return if (response.first in setOf(404, 405, 422)) null else response.alerts()
  }

  /** Current weather and place name for the widget (POST /weather, from the same forecast). */
  private fun postWeather(baseUrl: String, lat: Double, lon: Double, forecast: JSONObject, language: String) =
      try {
        val body = JSONObject().put("latitude", lat).put("longitude", lon).put("forecast", forecast)
        val (code, text) = request("$baseUrl/weather", language, body.toString())
        if (code in 200..299) JSONObject(text) else null
      } catch (e: Exception) {
        null
      }

  /** (HTTP status, body). Throws IOException when there is no connection. */
  private fun request(
      url: String,
      language: String?,
      jsonBody: String? = null,
      // Free hosting plans can take ~1 minute to wake up.
      timeoutMs: Int = 60_000,
  ): Pair<Int, String> {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = timeoutMs
    connection.readTimeout = timeoutMs
    connection.setRequestProperty("Accept", "application/json")
    // Alert titles and descriptions come back in the language chosen in the app.
    language?.let { connection.setRequestProperty("Accept-Language", it) }
    try {
      if (jsonBody != null) {
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(jsonBody.toByteArray()) }
      }
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      return code to (stream?.bufferedReader()?.use { it.readText() } ?: "")
    } finally {
      connection.disconnect()
    }
  }

  private fun Pair<Int, String>.alerts(): JSONArray {
    if (first !in 200..299) throw IOException("HTTP $first")
    return JSONObject(second).optJSONArray("alerts") ?: JSONArray()
  }

  companion object {
    /**
     * Shows one alert. The notification id comes from the alert id, so the same warning from the
     * background check and from a push (PushService) is one notification, not two.
     */
    fun notify(context: Context, alert: JSONObject, severity: String, reminder: Boolean = false) {
      if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
              ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                  PackageManager.PERMISSION_GRANTED
      ) {
        return
      }
      createChannel(context)

      val title = alert.optString("title")
      // Pushed warnings have no place name: their text comes first then.
      val area = alert.optString("area")
      val description = alert.optString("description")
      val launch =
          context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("alertId", alert.optString("id"))
          }
      val pending =
          PendingIntent.getActivity(
              context,
              alert.optString("id").hashCode(),
              launch,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
          )

      val notification =
          NotificationCompat.Builder(context, if (reminder) REMINDER_CHANNEL_ID else CHANNEL_ID)
              .setSmallIcon(R.drawable.ic_stat_alert)
              .setColor(
                  when {
                    reminder -> 0xFF2A78D6.toInt()
                    severity == "moderate" -> 0xFFFFA500.toInt()
                    else -> 0xFFE53935.toInt()
                  })
              .setContentTitle(title)
              .setContentText(area.ifEmpty { description })
              .setStyle(
                  NotificationCompat.BigTextStyle()
                      .bigText(if (area.isEmpty()) description else "$area\n$description")
              )
              .setPriority(
                  if (reminder || severity == "moderate") NotificationCompat.PRIORITY_DEFAULT
                  else NotificationCompat.PRIORITY_HIGH
              )
              .setCategory(
                  if (reminder) NotificationCompat.CATEGORY_REMINDER
                  else NotificationCompat.CATEGORY_ALARM)
              .setContentIntent(pending)
              .setAutoCancel(true)
              .build()
      NotificationManagerCompat.from(context).notify(alert.optString("id").hashCode(), notification)
    }

    const val CHANNEL_ID = "disaster_alerts"
    // The morning reminders (rain, strong sun; backend/services/push.py), apart so they can be
    // turned off alone. The id is from when it was rain only: a new id would be a new channel, and
    // phones that turned the reminders off would get them again.
    const val REMINDER_CHANNEL_ID = "rain_reminders"
    private val NOTIFY_SEVERITIES = setOf("moderate", "high", "severe")

    // Keep equal to services/openMeteo.ts and backend/services/weather.py (a backend test checks).
    private const val FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
    private const val CURRENT_VARS =
        "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation," +
            "weather_code,wind_speed_10m,wind_gusts_10m"
    private const val HOURLY_VARS =
        "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m," +
            "wind_gusts_10m"
    private const val DAILY_VARS =
        "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max," +
            "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max," +
            "sunrise,sunset"

    /** ~1 km (ward level), like the app (services/openMeteo.ts). */
    private const val SNAP_STEP = 0.01

    // Keep equal to services/glofas.ts and backend/services/flood.py (a backend test checks).
    private const val FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
    private const val FORECAST_VARS = "river_discharge,river_discharge_p25,river_discharge_p75"
    private const val PAST_DAYS = 3
    private const val FORECAST_DAYS = 16

    private fun snap(value: Double) = Math.round(Math.round(value / SNAP_STEP) * SNAP_STEP * 10000) / 10000.0

    fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      // Calling this again is safe: it only updates the name and description, which follow
      // the phone's language (res/values and res/values-vi).
      val channel =
          NotificationChannel(
                  CHANNEL_ID,
                  context.getString(R.string.alert_channel_name),
                  NotificationManager.IMPORTANCE_HIGH,
              )
              .apply { description = context.getString(R.string.alert_channel_description) }
      manager.createNotificationChannel(channel)
      // Shown in the list without popping up over the screen.
      val reminders =
          NotificationChannel(
                  REMINDER_CHANNEL_ID,
                  context.getString(R.string.reminder_channel_name),
                  NotificationManager.IMPORTANCE_DEFAULT,
              )
              .apply { description = context.getString(R.string.reminder_channel_description) }
      manager.createNotificationChannel(reminders)
    }
  }
}

/** Settings shared between the JS module and the background worker. */
class AlertPrefs(context: Context) {
  private val prefs = context.getSharedPreferences("floodshield_alerts", Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = prefs.getBoolean("enabled", false)
    set(value) = prefs.edit().putBoolean("enabled", value).apply()

  var apiBaseUrl: String?
    get() = prefs.getString("api_base_url", null)
    set(value) = prefs.edit().putString("api_base_url", value).apply()

  var latitude: Double?
    get() = prefs.getString("latitude", null)?.toDoubleOrNull()
    set(value) = prefs.edit().putString("latitude", value?.toString()).apply()

  var longitude: Double?
    get() = prefs.getString("longitude", null)?.toDoubleOrNull()
    set(value) = prefs.edit().putString("longitude", value?.toString()).apply()

  var language: String
    get() = prefs.getString("language", null) ?: "vi"
    set(value) = prefs.edit().putString("language", value).apply()

  /** JSON from the app: the river near the saved location (see fetchRiver). */
  var river: String?
    get() = prefs.getString("river", null)
    set(value) = prefs.edit().putString("river", value).apply()

  /** The app's random id (X-Device-Id): the server files this phone's push token under it. */
  var deviceId: String?
    get() = prefs.getString("device_id", null)
    set(value) = prefs.edit().putString("device_id", value).apply()

  /** Firebase's push token for this install (PushService.onNewToken). */
  var pushToken: String?
    get() = prefs.getString("push_token", null)
    set(value) = prefs.edit().putString("push_token", value).apply()

  /** What was last registered with PUT /push, and when (PushRegistration); null: not registered. */
  var pushRegistered: String?
    get() = prefs.getString("push_registered", null)
    set(value) = prefs.edit().putString("push_registered", value).apply()

  var pushRegisteredAt: Long
    get() = prefs.getLong("push_registered_at", 0)
    set(value) = prefs.edit().putLong("push_registered_at", value).apply()

  /** Insertion-ordered so the oldest ids can be dropped. */
  fun seenIds(): LinkedHashSet<String> {
    val json = JSONArray(prefs.getString("seen_ids", "[]"))
    return LinkedHashSet<String>().apply { for (i in 0 until json.length()) add(json.getString(i)) }
  }

  fun saveSeenIds(ids: Set<String>) {
    val trimmed = ids.toList().takeLast(MAX_SEEN)
    prefs.edit().putString("seen_ids", JSONArray(trimmed).toString()).apply()
  }

  companion object {
    private const val MAX_SEEN = 300
  }
}
