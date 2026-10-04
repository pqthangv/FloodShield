package com.pqt_mobile.alerts

import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.pqt_mobile.specs.NativeAlertSchedulerSpec
import java.util.concurrent.TimeUnit

/** JS entry point for the background alert checker (specs/NativeAlertScheduler.ts). */
class AlertSchedulerModule(reactContext: ReactApplicationContext) :
    NativeAlertSchedulerSpec(reactContext) {

  private val prefs = AlertPrefs(reactContext)
  private val workManager = WorkManager.getInstance(reactContext)

  override fun configure(apiBaseUrl: String, latitude: Double, longitude: Double, enabled: Boolean) {
    prefs.apiBaseUrl = apiBaseUrl.trimEnd('/')
    prefs.latitude = latitude
    prefs.longitude = longitude
    prefs.enabled = enabled
    AlertWorker.createChannel(reactApplicationContext)

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
