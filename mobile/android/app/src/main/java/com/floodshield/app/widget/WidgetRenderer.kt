package com.floodshield.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextView
import com.floodshield.app.R
import com.floodshield.app.alerts.AlertPrefs
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToInt

/** The 4 x 2 widget: weather, place, update time and the warning band. */
class MediumWidget : FloodShieldWidget(small = false)

/** The 2 x 2 widget: weather, place and a short warning band. */
class SmallWidget : FloodShieldWidget(small = true)

abstract class FloodShieldWidget(private val small: Boolean) : AppWidgetProvider() {
  // Also every 30 minutes (updatePeriodMillis), so an old check turns neutral by itself.
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) WidgetRenderer.update(context, manager, id, small)
  }

  // Its size on the home screen changed (resized, or another launcher grid). On Android 12+ the
  // launcher already picks the layout for the size; older ones need a new drawing.
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, WidgetRenderer.views(context, small, options))
  }
}

object WidgetRenderer {
  private val PROVIDERS = listOf(MediumWidget::class.java to false, SmallWidget::class.java to true)

  /** Redraws every FloodShield widget on the home screen from the saved snapshot. */
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    for ((provider, small) in PROVIDERS) {
      for (id in manager.getAppWidgetIds(ComponentName(context, provider))) update(context, manager, id, small)
    }
  }

  /** One widget, drawn for its own size on the home screen. */
  fun update(context: Context, manager: AppWidgetManager, id: Int, small: Boolean) {
    manager.updateAppWidget(id, views(context, small, manager.getAppWidgetOptions(id)))
  }

  /** Whether the user has put a widget on the home screen (the weather is only fetched for one). */
  fun hasWidgets(context: Context): Boolean {
    val manager = AppWidgetManager.getInstance(context)
    return PROVIDERS.any { (provider, _) -> manager.getAppWidgetIds(ComponentName(context, provider)).isNotEmpty() }
  }

  fun views(context: Context, small: Boolean, options: Bundle?): RemoteViews {
    val snapshot = WidgetStore(context).load()
    // The app's language (Settings), not the phone's.
    val texts = inLanguage(context, AlertPrefs(context).language)
    val fontScale = context.resources.configuration.fontScale
    val scale = widgetScale(fontScale)
    val needs = measuredNeeds(context, texts, snapshot, small, fontScale, scale)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // One layout per size: the launcher draws the one that fits, also after a resize.
      return RemoteViews(
          layoutSizes(small, fontScale, needs).associate { (width, height) ->
            SizeF(width, height) to
                draw(context, texts, snapshot, small, layoutFor(small, width, height, fontScale, needs), scale)
          })
    }
    // Older Android: the size the launcher reports (in portrait: its smallest width and largest
    // height); onAppWidgetOptionsChanged redraws when it changes.
    val width = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
    val height = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) ?: 0
    return draw(
        context,
        texts,
        snapshot,
        small,
        layoutFor(small, width.toFloat(), height.toFloat(), fontScale, needs),
        scale)
  }

  /**
   * Where the row with wind and feels like fits whole, measured here as the launcher will draw it
   * (the same phone, fonts and text size) with the texts to show, at a few widths (WidgetState.kt).
   */
  private fun measuredNeeds(
      context: Context,
      texts: Context,
      snapshot: Snapshot?,
      small: Boolean,
      fontScale: Float,
      scale: Float,
  ): Needs {
    fun needs(look: List<Float>, layout: WidgetLayout): List<Need> {
      val views = draw(context, texts, snapshot, small, layout, scale)
      return measureWidths(look, fontScale).map { width -> Need(width, heightDp(context, views, width)) }
    }
    return try {
      if (small) {
        Needs(emptyList(), emptyList(), needs(SMALL_WIDTHS, WidgetLayout(narrow = false, details = true)))
      } else {
        Needs(
            smallTop = needs(SMALL_TOP_WIDTHS, WidgetLayout(narrow = true, details = true)),
            bigTop = needs(BIG_TOP_WIDTHS, WidgetLayout(narrow = false, details = true)),
            small = emptyList())
      }
    } catch (e: Exception) {
      defaultNeeds(fontScale)
    }
  }

  /**
   * The height [views] takes at [widthDp] wide, drawn here in the app; infinite when the row with
   * wind and feels like doesn't fit across (at large text "12 km/h" was cut to "12 km/").
   */
  private fun heightDp(context: Context, views: RemoteViews, widthDp: Float): Float {
    val density = context.resources.displayMetrics.density
    val view = views.apply(context, FrameLayout(context))
    view.measure(
        View.MeasureSpec.makeMeasureSpec((widthDp * density).roundToInt(), View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    val details = view.findViewById<View>(R.id.widget_details)
    if (details?.visibility == View.VISIBLE && details.hasCutText()) return Float.POSITIVE_INFINITY
    // Whole dp, never less than needed: the launcher compares whole dp.
    return ceil(view.measuredHeight / density)
  }

  /** Whether a text in here is cut off, wraps past its line limit or ends in "…". */
  private fun View.hasCutText(): Boolean =
      when (this) {
        is TextView -> {
          val lines = layout
          val room = measuredWidth - totalPaddingLeft - totalPaddingRight + 0.5f
          lines != null &&
              (lines.lineCount > maxLines ||
                  (0 until lines.lineCount).any { lines.getEllipsisCount(it) > 0 || lines.getLineWidth(it) > room })
        }
        is ViewGroup -> (0 until childCount).any { getChildAt(it).hasCutText() }
        else -> false
      }

  private fun draw(
      context: Context,
      texts: Context,
      snapshot: Snapshot?,
      small: Boolean,
      layout: WidgetLayout,
      scale: Float,
  ): RemoteViews {
    val views =
        RemoteViews(
            context.packageName,
            when {
              small -> R.layout.widget_small
              layout.smallTop -> R.layout.widget_medium_narrow
              else -> R.layout.widget_medium
            })

    for ((id, sp) in textSizes(small, layout.smallTop)) {
      views.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_DIP, sp * scale)
    }
    // The launcher reuses the drawn widget: after a change of font size, the band kept the
    // height of an earlier two-line text, and "No alerts" sat above its tick. Setting the line limits
    // again measures the texts anew (the same ones as in the layouts).
    val lineLimits =
        if (small) listOf(R.id.widget_place to 1, R.id.widget_band_text to 2)
        else listOf(R.id.widget_condition to 2, R.id.widget_place to 2, R.id.widget_updated to 2, R.id.widget_band_text to 2)
    for ((id, lines) in lineLimits) views.setInt(id, "setMaxLines", lines)
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

    // Wind, feels like (and humidity on the 4 x 2), when there's room. On the 4 x 2 the space
    // below it comes and goes with it, so the top row alone stays centred.
    if (snapshot?.temperature != null && layout.details) {
      views.setViewVisibility(R.id.widget_details, View.VISIBLE)
      if (!small) views.setViewVisibility(R.id.widget_details_space, View.VISIBLE)
      views.setTextViewText(R.id.widget_wind_label, texts.getString(R.string.widget_wind))
      views.setTextViewText(R.id.widget_wind, snapshot.windSpeed?.let { "${it.roundToInt()} km/h" } ?: "--")
      views.setTextViewText(R.id.widget_feels_like_label, texts.getString(R.string.widget_feels_like))
      views.setTextViewText(R.id.widget_feels_like, snapshot.feelsLike?.let { "${it.roundToInt()}°" } ?: "--")
      if (!small) {
        views.setTextViewText(R.id.widget_humidity_label, texts.getString(R.string.widget_humidity))
        views.setTextViewText(R.id.widget_humidity, snapshot.humidity?.let { "${it.roundToInt()}%" } ?: "--")
      }
    } else {
      views.setViewVisibility(R.id.widget_details, View.GONE)
      if (!small) views.setViewVisibility(R.id.widget_details_space, View.GONE)
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
        // The short words where the sentence would need two lines anyway.
        views.setTextViewText(
            R.id.widget_band_text,
            texts.getString(if (small || layout.smallTop) R.string.widget_no_alerts_short else R.string.widget_no_alerts))
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

  /**
   * The layouts' text sizes (sp at font scale 1, the same as in the XML files), set here in dp so
   * they grow with the phone's font scale only up to MAX_FONT_SCALE (widgetScale).
   */
  private fun textSizes(small: Boolean, smallTop: Boolean): List<Pair<Int, Float>> {
    val label = if (small) 11f else 12f
    val value = if (small) 15f else 16f
    val details =
        listOf(
            R.id.widget_wind_label to label,
            R.id.widget_wind to value,
            R.id.widget_feels_like_label to label,
            R.id.widget_feels_like to value)
    if (small) {
      return details + listOf(R.id.widget_temperature to 26f, R.id.widget_place to 13f, R.id.widget_band_text to 13f)
    }
    val top =
        if (smallTop) {
          listOf(R.id.widget_temperature to 28f, R.id.widget_condition to 13f, R.id.widget_place to 13f, R.id.widget_updated to 12f)
        } else {
          listOf(R.id.widget_temperature to 34f, R.id.widget_condition to 15f, R.id.widget_place to 15f, R.id.widget_updated to 13f)
        }
    return details + top +
        listOf(R.id.widget_humidity_label to label, R.id.widget_humidity to value, R.id.widget_band_text to 16f)
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
