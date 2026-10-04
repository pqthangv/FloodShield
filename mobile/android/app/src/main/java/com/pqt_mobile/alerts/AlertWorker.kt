package com.pqt_mobile.alerts

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
import com.pqt_mobile.R
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
          fetchAlerts("$baseUrl/alerts?lat=$lat&lon=$lon")
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

  private fun fetchAlerts(url: String): JSONArray {
    val connection = URL(url).openConnection() as HttpURLConnection
    // Free hosting plans can take ~1 minute to wake up.
    connection.connectTimeout = 60_000
    connection.readTimeout = 60_000
    connection.setRequestProperty("Accept", "application/json")
    try {
      if (connection.responseCode !in 200..299) {
        throw IOException("HTTP ${connection.responseCode}")
      }
      val body = connection.inputStream.bufferedReader().use { it.readText() }
      return JSONObject(body).optJSONArray("alerts") ?: JSONArray()
    } finally {
      connection.disconnect()
    }
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

    fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel =
          NotificationChannel(CHANNEL_ID, "Cảnh báo thiên tai", NotificationManager.IMPORTANCE_HIGH)
              .apply {
                description = "Cảnh báo lũ lụt, mưa lớn, bão và thiên tai tại vị trí của bạn"
              }
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
