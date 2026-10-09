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

    val alerts =
        try {
          // The phone downloads the forecast itself (see services/openMeteo.ts) and the server
          // turns it into alerts. Without one, the server tries to fetch the forecast itself.
          val forecast = fetchForecast(lat, lon)
          (forecast?.let { postAlerts(baseUrl, lat, lon, it, prefs.language) })
              ?: request("$baseUrl/alerts?lat=$lat&lon=$lon", prefs.language).alerts()
        } catch (e: IOException) {
          return Result.retry()
        } catch (e: Exception) {
          return Result.failure()
        }

    val seen = prefs.seenIds()
    for (i in 0 until alerts.length()) {
      val alert = alerts.getJSONObject(i)
      val id = alert.optString("id")
      val severity = alert.optString("severity")
      if (id.isEmpty() || id in seen || severity !in NOTIFY_SEVERITIES) continue
      notify(alert, severity)
      seen.add(id)
    }
    prefs.saveSeenIds(seen)
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

  /** Alerts from the phone's own forecast; null when the server can't take it (old or rejected). */
  private fun postAlerts(baseUrl: String, lat: Double, lon: Double, forecast: JSONObject, language: String): JSONArray? {
    val body = JSONObject().put("latitude", lat).put("longitude", lon).put("forecast", forecast)
    val response = request("$baseUrl/alerts", language, body.toString())
    return if (response.first in setOf(404, 405, 422)) null else response.alerts()
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

  private fun notify(alert: JSONObject, severity: String) {
    val context = applicationContext
    if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    createChannel(context)

    val title = alert.optString("title")
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
        NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_alert)
            .setColor(if (severity == "moderate") 0xFFFFA500.toInt() else 0xFFE53935.toInt())
            .setContentTitle(title)
            .setContentText(area)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$area\n$description"))
            .setPriority(
                if (severity == "moderate") NotificationCompat.PRIORITY_DEFAULT
                else NotificationCompat.PRIORITY_HIGH
            )
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
    NotificationManagerCompat.from(context).notify(alert.optString("id").hashCode(), notification)
  }

  companion object {
    const val CHANNEL_ID = "disaster_alerts"
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
