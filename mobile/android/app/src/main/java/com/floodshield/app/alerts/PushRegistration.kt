package com.floodshield.app.alerts

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Keeps this phone registered with the server for rain-warning pushes (PUT /push, see
 * backend/routers/PushRoute.py): its Firebase token, its area and the app's language. Turning
 * alerts off removes the registration (DELETE /push).
 */
object PushRegistration {
  private const val WORK = "floodshield-push-registration"
  // The server forgets phones that don't check in for 60 days; refresh once a day.
  private const val REFRESH_MS = 24 * 60 * 60 * 1000L

  /** Gets Firebase's token (when this build has Firebase) and registers in the background. */
  fun update(context: Context) {
    // Built without google-services.json: no push, the background check still works.
    if (FirebaseApp.getApps(context).isNotEmpty()) {
      FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
        AlertPrefs(context).pushToken = token
        schedule(context)
      }
    }
    schedule(context)
  }

  fun schedule(context: Context) {
    val request =
        OneTimeWorkRequestBuilder<PushRegistrationWorker>()
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, request)
  }

  /** Sends what changed, or a daily refresh. Blocking; false means try again later. */
  fun sync(context: Context): Boolean {
    val prefs = AlertPrefs(context)
    val baseUrl = prefs.apiBaseUrl ?: return true
    val deviceId = prefs.deviceId ?: return true
    val token = prefs.pushToken
    val lat = prefs.latitude
    val lon = prefs.longitude
    if (!prefs.enabled || token == null || lat == null || lon == null) {
      if (prefs.pushRegistered == null) return true
      val code = send("$baseUrl/push", "DELETE", deviceId, prefs.language, null) ?: return false
      if (code in 200..499) prefs.pushRegistered = null
      return true
    }
    // The server rounds to the same ~10 km area, so moving inside it changes nothing.
    val registration = "$baseUrl|$token|${Math.round(lat * 10)}|${Math.round(lon * 10)}|${prefs.language}"
    val now = System.currentTimeMillis()
    if (registration == prefs.pushRegistered && now - prefs.pushRegisteredAt < REFRESH_MS) return true
    val body =
        JSONObject()
            .put("token", token)
            .put("platform", "android")
            .put("latitude", lat)
            .put("longitude", lon)
    val code = send("$baseUrl/push", "PUT", deviceId, prefs.language, body.toString()) ?: return false
    if (code in 200..299) {
      prefs.pushRegistered = registration
      prefs.pushRegisteredAt = now
    }
    // Other answers (an older server without push, a refused value) aren't retried right away;
    // the next background check tries again.
    return true
  }

  /** The HTTP status, or null when there is no connection. */
  private fun send(url: String, method: String, deviceId: String, language: String, json: String?): Int? {
    val connection = URL(url).openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = method
      connection.connectTimeout = 30_000
      connection.readTimeout = 30_000
      connection.setRequestProperty("X-Device-Id", deviceId)
      // Warnings are written in the language chosen in the app.
      connection.setRequestProperty("Accept-Language", language)
      if (json != null) {
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(json.toByteArray()) }
      }
      connection.responseCode
    } catch (e: IOException) {
      null
    } finally {
      connection.disconnect()
    }
  }
}

class PushRegistrationWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result =
      if (PushRegistration.sync(applicationContext)) Result.success() else Result.retry()
}
