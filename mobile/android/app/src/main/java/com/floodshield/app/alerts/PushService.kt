package com.floodshield.app.alerts

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/** Rain warnings pushed by the server (backend/services/push.py), and Firebase's tokens. */
class PushService : FirebaseMessagingService() {

  /** A new token: first launch, reinstall, or Firebase replacing it. */
  override fun onNewToken(token: String) {
    AlertPrefs(applicationContext).pushToken = token
    PushRegistration.schedule(applicationContext)
  }

  /**
   * The server sends data messages (no notification part), so this runs even when the app is
   * closed, and the warning is shown the same way as by the background check.
   */
  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    val id = data["id"] ?: return
    val title = data["title"] ?: return
    val prefs = AlertPrefs(applicationContext)
    val seen = prefs.seenIds()
    // Alerts turned off since, or already shown by the background check or seen in the app.
    if (!prefs.enabled || id in seen) return
    val alert = JSONObject().put("id", id).put("title", title).put("description", data["body"] ?: "")
    // "reminder": the morning "take an umbrella" push, on its own quieter channel.
    AlertWorker.notify(
        applicationContext, alert, data["severity"] ?: "moderate", reminder = data["kind"] == "reminder")
    seen.add(id)
    prefs.saveSeenIds(seen)
  }
}
