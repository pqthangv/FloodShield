package com.floodshield.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.view.View
import android.widget.RemoteViews
import com.floodshield.app.R
import com.floodshield.app.alerts.AlertPrefs
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/** The 4 x 2 widget: weather, place, update time and the warning band. */
class MediumWidget : FloodShieldWidget(small = false)

/** The 2 x 2 widget: weather, place and a short warning band. */
class SmallWidget : FloodShieldWidget(small = true)

abstract class FloodShieldWidget(private val small: Boolean) : AppWidgetProvider() {
  // Also every 30 minutes (updatePeriodMillis), so an old check turns neutral by itself.
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    manager.updateAppWidget(ids, WidgetRenderer.views(context, small))
  }
}

object WidgetRenderer {
  private val PROVIDERS = listOf(MediumWidget::class.java to false, SmallWidget::class.java to true)

  /** Redraws every FloodShield widget on the home screen from the saved snapshot. */
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    for ((provider, small) in PROVIDERS) {
      val ids = manager.getAppWidgetIds(ComponentName(context, provider))
      if (ids.isNotEmpty()) manager.updateAppWidget(ids, views(context, small))
    }
  }

  /** Whether the user has put a widget on the home screen (the weather is only fetched for one). */
  fun hasWidgets(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    return PROVIDERS.any { (provider, _) -> manager.getAppWidgetIds(ComponentName(context, provider)).isNotEmpty() }
  }

  fun views(context: Context, small: Boolean): RemoteViews {
    val snapshot = WidgetStore(context).load()
    // The app's language (Settings), not the phone's.
    val texts = inLanguage(context, AlertPrefs(context).language)
    val views = RemoteViews(context.packageName, if (small) R.layout.widget_small else R.layout.widget_medium)

    views.setImageViewResource(R.id.widget_icon, iconFor(snapshot?.icon, snapshot?.isDay ?: true))
    views.setTextViewText(
        R.id.widget_temperature, snapshot?.temperature?.let { "${it.roundToInt()}°" } ?: "--°")
    views.setTextViewText(R.id.widget_place, snapshot?.place ?: context.getString(R.string.app_name))
    if (!small) {
      views.setTextViewText(R.id.widget_condition, snapshot?.condition ?: "")
      views.setTextViewText(
          R.id.widget_updated,
          snapshot?.checkedAt?.takeIf { it > 0 }?.let {
            texts.getString(R.string.widget_updated, SimpleDateFormat("HH:mm", Locale.ROOT).format(Date(it)))
          } ?: "")
    }

    when (val band = bandFor(snapshot, System.currentTimeMillis())) {
      Band.Unknown -> {
        views.setInt(R.id.widget_band, "setBackgroundResource", R.drawable.widget_band_unknown)
        views.setViewVisibility(R.id.widget_band_icon, View.GONE)
        views.setTextViewText(R.id.widget_band_text, texts.getString(R.string.widget_open_app))
        views.setTextColor(R.id.widget_band_text, WHITE)
      }
      Band.Clear -> {
        views.setInt(R.id.widget_band, "setBackgroundResource", R.drawable.widget_band_clear)
        views.setViewVisibility(R.id.widget_band_icon, View.VISIBLE)
        views.setImageViewResource(R.id.widget_band_icon, R.drawable.ic_widget_check)
        views.setInt(R.id.widget_band_icon, "setColorFilter", 0)
        views.setTextViewText(
            R.id.widget_band_text,
            texts.getString(if (small) R.string.widget_no_alerts_short else R.string.widget_no_alerts))
        views.setTextColor(R.id.widget_band_text, WHITE)
      }
      is Band.Warning -> {
        // White on the orange of "moderate" is hard to read: navy there.
        val ink = if (band.severity == "moderate") NAVY else WHITE
        views.setInt(R.id.widget_band, "setBackgroundResource", bandBackground(band.severity))
        views.setViewVisibility(R.id.widget_band_icon, View.VISIBLE)
        views.setImageViewResource(R.id.widget_band_icon, R.drawable.ic_widget_warning)
        views.setInt(R.id.widget_band_icon, "setColorFilter", ink)
        val others = if (band.others > 0) " " + texts.getString(R.string.widget_more, band.others) else ""
        val text =
            if (small) band.title + others
            else "${band.title}$others · ${texts.getString(severityLabel(band.severity))}"
        views.setTextViewText(R.id.widget_band_text, text)
        views.setTextColor(R.id.widget_band_text, ink)
      }
    }

    // A tap opens the app.
    val launch =
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
    if (launch != null) {
      views.setOnClickPendingIntent(
          android.R.id.background,
          PendingIntent.getActivity(
              context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    return views
  }

  private fun inLanguage(context: Context, language: String): Context {
    val config = Configuration(context.resources.configuration)
    config.setLocale(Locale.forLanguageTag(language))
    return context.createConfigurationContext(config)
  }

  /** The app's weather pictures (components/WeatherIcon.tsx), exported to res/drawable-nodpi. */
  private fun iconFor(icon: String?, isDay: Boolean) =
      when (icon) {
        "clear" -> if (isDay) R.drawable.widget_weather_clear_day else R.drawable.widget_weather_clear_night
        "drizzle" -> if (isDay) R.drawable.widget_weather_drizzle_day else R.drawable.widget_weather_drizzle_night
        "rain" -> R.drawable.widget_weather_rain
        "thunderstorm" ->
            if (isDay) R.drawable.widget_weather_thunderstorm_day else R.drawable.widget_weather_thunderstorm_night
        "snow" -> R.drawable.widget_weather_snow
        else -> if (isDay) R.drawable.widget_weather_cloudy_day else R.drawable.widget_weather_cloudy_night
      }

  private fun bandBackground(severity: String) =
      when (severity) {
        "info" -> R.drawable.widget_band_info
        "moderate" -> R.drawable.widget_band_moderate
        "severe" -> R.drawable.widget_band_severe
        else -> R.drawable.widget_band_high
      }

  private fun severityLabel(severity: String) =
      when (severity) {
        "info" -> R.string.severity_info
        "moderate" -> R.string.severity_moderate
        "severe" -> R.string.severity_severe
        else -> R.string.severity_high
      }

  private const val WHITE = 0xFFFFFFFF.toInt()
  private const val NAVY = 0xFF1F2D54.toInt()
}
