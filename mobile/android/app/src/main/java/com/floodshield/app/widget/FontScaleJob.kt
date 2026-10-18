package com.floodshield.app.widget

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings

/**
 * Redraws the widgets right after the phone's Font size changes. Their text sizes are worked out
 * when they're drawn (WidgetRenderer.textSizes, at most 130 %), and not every launcher asks for a
 * new drawing then: Android 11's didn't, and the widget kept its old text until the next check.
 * Android starts this job when the font_scale setting changes, also with the app closed; the job
 * then waits for the next change.
 *
 * A plain JobService, not WorkManager: when the change started the app from scratch, WorkManager
 * first rescheduled its jobs and dropped the one that had just started (seen on Android 11).
 */
class FontScaleJob : JobService() {

  override fun onStartJob(params: JobParameters): Boolean {
    Thread {
          if (WidgetRenderer.hasWidgets(this)) WidgetRenderer.updateAll(this)
          jobFinished(params, false)
          // Only after finishing: scheduling the job that is still running would stop it.
          if (WidgetRenderer.hasWidgets(this)) watch(this)
        }
        .start()
    return true
  }

  // Stopped early (rarely): the next app check or widget update arms it again.
  override fun onStopJob(params: JobParameters) = false

  companion object {
    /**
     * Far from WorkManager's job ids, which count up from 0 (AlertWorker and the push sync use
     * those).
     */
    private const val JOB_ID = 2_000_101_366

    /** Watches the Font size while a widget is on the home screen; again is harmless. */
    fun watch(context: Context) {
      val job =
          JobInfo.Builder(JOB_ID, ComponentName(context, FontScaleJob::class.java))
              .addTriggerContentUri(JobInfo.TriggerContentUri(Settings.System.getUriFor(Settings.System.FONT_SCALE), 0))
              // A moment after the change (Android's default waits 10 s).
              .setTriggerContentUpdateDelay(500)
              .setTriggerContentMaxDelay(5_000)
              .build()
      context.getSystemService(JobScheduler::class.java)?.schedule(job)
    }

    /** The last widget is gone: nothing to redraw any more. */
    fun stop(context: Context) {
      context.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
    }
  }
}
