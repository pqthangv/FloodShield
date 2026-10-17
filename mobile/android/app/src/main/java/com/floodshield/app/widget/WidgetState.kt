package com.floodshield.app.widget

/**
 * What the home-screen widget knows: saved by the app when it's open (setWidget) and by the
 * background check (AlertWorker). Texts are already in the app's language.
 */
data class Snapshot(
    val place: String? = null,
    val temperature: Double? = null,
    val condition: String? = null,
    /** The app's weather icon key: clear, cloudy, drizzle, rain, thunderstorm or snow. */
    val icon: String? = null,
    val isDay: Boolean = true,
    /** km/h */
    val windSpeed: Double? = null,
    val feelsLike: Double? = null,
    /** % */
    val humidity: Double? = null,
    /** null: no successful check yet for this place (or the last one failed). */
    val alerts: List<SnapshotAlert>? = null,
    /** When [alerts] were checked, in ms since 1970. */
    val checkedAt: Long = 0,
)

data class SnapshotAlert(val title: String, val severity: String)

/** The coloured band at the bottom of the widget. */
sealed interface Band {
  /** Not checked, the check failed, or it's too old: neither a warning nor "all clear". */
  data object Unknown : Band

  data object Clear : Band

  /** The most serious warning, and how many others there are. */
  data class Warning(val title: String, val severity: String, val others: Int) : Band
}

/**
 * Like the app's green card, "all clear" only after a recent check that worked: an old answer
 * may hide a warning that came since. After STALE_AFTER_MS a warning is not shown either, since
 * it may be over: the band then asks to open the app.
 */
fun bandFor(snapshot: Snapshot?, now: Long): Band {
  val alerts = snapshot?.alerts ?: return Band.Unknown
  if (now - snapshot.checkedAt > STALE_AFTER_MS || snapshot.checkedAt > now + CLOCK_SLACK_MS) {
    return Band.Unknown
  }
  val top = alerts.maxByOrNull { SEVERITY_ORDER.indexOf(it.severity) } ?: return Band.Clear
  return Band.Warning(top.title, top.severity, alerts.size - 1)
}

/**
 * How a widget is drawn at its size on the home screen. [narrow]: the 4 x 2's smaller top row
 * (widget_medium_narrow.xml); [details]: the row with wind, "feels like" (and humidity on the
 * 4 x 2).
 */
data class WidgetLayout(val narrow: Boolean, val details: Boolean)

/**
 * How much the widget's text grows with the phone's font scale (Settings > Display > Font size):
 * like the phone's, up to MAX_FONT_SCALE. Beyond it the text can't fit (seen at 200 %: "100"
 * without its °, warnings cut off); the app's own screens keep growing.
 */
fun widgetScale(fontScale: Float) = fontScale.coerceAtMost(MAX_FONT_SCALE)

/**
 * The layout for a size in dp; in portrait, the launcher's smallest width and largest height (0:
 * it didn't say). Larger text needs more room, so the limits grow with the widget's text scale.
 */
fun layoutFor(small: Boolean, widthDp: Float, heightDp: Float, fontScale: Float = 1f): WidgetLayout {
  val scale = widgetScale(fontScale).coerceAtLeast(1f)
  val tallEnough = heightDp >= (if (small) SMALL_DETAILS_DP else MEDIUM_DETAILS_DP) * scale
  // The 2 x 2's two columns also need the width ("12 km/h" was cut to "12" at 130 %).
  val wideEnough = !small || widthDp <= 0 || widthDp >= SMALL_DETAILS_WIDTH_DP * scale
  return WidgetLayout(
      narrow = !small && widthDp > 0 && widthDp < NARROW_BELOW_DP * scale,
      details = tallEnough && wideEnough,
  )
}

/**
 * Android 12+: the sizes (width to height, dp) where the layout changes. The launcher draws the
 * largest one that fits, also after a resize or a change of grid, without asking the app.
 */
fun layoutSizes(small: Boolean, fontScale: Float = 1f): List<Pair<Float, Float>> {
  val scale = widgetScale(fontScale).coerceAtLeast(1f)
  // The 2 x 2: without the details row, or with it once wide and tall enough.
  if (small) return listOf(1f to 1f, SMALL_DETAILS_WIDTH_DP * scale to SMALL_DETAILS_DP * scale)
  val widths = listOf(1f, NARROW_BELOW_DP * scale)
  val heights = listOf(1f, MEDIUM_DETAILS_DP * scale)
  return widths.flatMap { width -> heights.map { height -> width to height } }
}

/** Narrower than this (dp, at font scale 1), the 4 x 2's top row is too tight at its full size. */
const val NARROW_BELOW_DP = 300f
/** The details row fits from this height (dp, at font scale 1). */
const val MEDIUM_DETAILS_DP = 160f
const val SMALL_DETAILS_DP = 130f
/** The 2 x 2's details row fits from this width (dp, at font scale 1). */
const val SMALL_DETAILS_WIDTH_DP = 125f
const val MAX_FONT_SCALE = 1.3f

/** The background check runs about every 30 minutes; a few missed runs are fine. */
const val STALE_AFTER_MS = 3 * 60 * 60 * 1000L

/** A phone clock set back a little shouldn't make a fresh check look like it's from the future. */
private const val CLOCK_SLACK_MS = 10 * 60 * 1000L

/** Least to most serious; maxByOrNull keeps the first of equals, so the server's order wins. */
private val SEVERITY_ORDER = listOf("info", "moderate", "high", "severe")
