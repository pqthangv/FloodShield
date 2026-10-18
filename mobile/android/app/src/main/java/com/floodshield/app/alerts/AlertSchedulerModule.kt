package com.floodshield.app.alerts

import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.floodshield.app.specs.NativeAlertSchedulerSpec
import com.floodshield.app.widget.WidgetRenderer
import com.floodshield.app.widget.WidgetStore
import java.util.concurrent.TimeUnit

/** JS entry point for the background alert checker (specs/NativeAlertScheduler.ts). */
class AlertSchedulerModule(reactContext: ReactApplicationContext) :
    NativeAlertSchedulerSpec(reactContext) {

  private val prefs = AlertPrefs(reactContext)
  private val workManager = WorkManager.getInstance(reactContext)

  override fun configure(
      apiBaseUrl: String,
      latitude: Double,
      longitude: Double,
      enabled: Boolean,
      language: String,
      deviceId: String,
  ) {
    prefs.apiBaseUrl = apiBaseUrl.trimEnd('/')
    prefs.latitude = latitude
    prefs.longitude = longitude
    prefs.enabled = enabled
    prefs.language = language
    prefs.deviceId = deviceId
    AlertWorker.createChannel(reactApplicationContext)
    // Registers for rain-warning pushes, or removes the registration when alerts are off.
    PushRegistration.update(reactApplicationContext)
    // The widget's own texts follow the language chosen in the app.
    WidgetRenderer.updateAll(reactApplicationContext)

    if (!enabled) {
      workManager.cancelUniqueWork(PERIODIC_WORK)
      return
    }
    val request =
        PeriodicWorkRequestBuilder<AlertWorker>(30, TimeUnit.MINUTES)
            .setConstraints(networkConstraint())
            .build()
    // KEEP: re-configuring (e.g. on every app start) does not reset the schedule.
    workManager.enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  override fun setRiver(river: String) {
    prefs.river = river
  }

  override fun setWidget(snapshot: String) {
    WidgetStore(reactApplicationContext).saveFromApp(snapshot)
    WidgetRenderer.updateAll(reactApplicationContext)
  }

  override fun setWidgetTest(on: Boolean) {
    WidgetStore(reactApplicationContext).test = on
    WidgetRenderer.updateAll(reactApplicationContext)
  }

  override fun markSeen(ids: ReadableArray) {
    val seen = prefs.seenIds()
    for (i in 0 until ids.size()) {
      ids.getString(i)?.let { seen.add(it) }
    }
    prefs.saveSeenIds(seen)
  }

  override fun checkNow() {
    val request = OneTimeWorkRequestBuilder<AlertWorker>().setConstraints(networkConstraint()).build()
    workManager.enqueue(request)
  }

  private fun networkConstraint() =
      Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

  companion object {
    const val NAME = NativeAlertSchedulerSpec.NAME
    private const val PERIODIC_WORK = "floodshield-alert-check"
  }
}
