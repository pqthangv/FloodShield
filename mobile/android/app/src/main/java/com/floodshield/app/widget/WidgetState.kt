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
 * How a widget is drawn at its size on the home screen. [narrow]: too narrow for the 4 x 2's big
 * top row; [details]: the row with wind, "feels like" (and humidity on the 4 x 2); [short]: the
 * 4 x 2 is wide enough for its big top row but only tall enough for that row with the small one;
 * [oneValue]: the 2 x 2 at large text shows "feels like" alone, on one line, instead of the row.
 */
data class WidgetLayout(
    val narrow: Boolean,
    val details: Boolean,
    val short: Boolean = false,
    val oneValue: Boolean = false,
) {
  /** The 4 x 2's smaller top row, thinner band and short "No alerts" (widget_medium_narrow.xml). */
  val smallTop: Boolean
    get() = narrow || short
}

/**
 * From [widthDp] wide on, the row with wind and feels like fits whole from [heightDp] tall
 * (infinite: it doesn't fit across, a text would be cut).
 */
data class Need(val widthDp: Float, val heightDp: Float)

/**
 * Where the row with wind and feels like fits whole, narrowest width first (a narrower widget may
 * need more: a place or a warning on two lines): the 4 x 2 with its small top row ([smallTop]) and
 * with its big one ([bigTop]), the 2 x 2 ([small]) and the 2 x 2's one-line "feels like"
 * ([smallOne], only at large text). WidgetRenderer measures them on the phone, with its fonts, text
 * size and the texts to show; [defaultNeeds] when it can't.
 */
data class Needs(
    val smallTop: List<Need>,
    val bigTop: List<Need>,
    val small: List<Need>,
    val smallOne: List<Need> = emptyList(),
)

/**
 * The 2 x 2's one-line "feels like" is only for text larger than normal (Settings > Display > Font
 * size): there the two columns rarely fit (the user's choice, 2026-10-18). At normal text a 2 x 2
 * without room for the row stays as it is.
 */
fun oneValueAllowed(fontScale: Float) = fontScale > 1f

/**
 * The needs measured on the Android14 emulator with one-line texts at font scale 1. Larger text
 * needs more, here a little too much: the pictures and paddings don't grow with it.
 */
fun defaultNeeds(fontScale: Float = 1f): Needs {
  val scale = widgetScale(fontScale).coerceAtLeast(1f)
  val wide = NARROW_BELOW_DP * scale
  return Needs(
      // Also at the first wide width, where the big top row starts: layoutSizes relies on it.
      smallTop = listOf(Need(MEDIUM_MIN_WIDTH_DP, SMALL_TOP_DETAILS_DP * scale), Need(wide, SMALL_TOP_DETAILS_DP * scale)),
      bigTop = listOf(Need(wide, BIG_TOP_DETAILS_DP * scale)),
      small = listOf(Need(SMALL_DETAILS_WIDTH_DP * scale, SMALL_DETAILS_DP * scale)),
  )
}

/**
 * The widths (dp) the renderer measures the 4 x 2's looks at: where each starts to be used, and
 * wider ones where it may need less. Like the big top row's limit (NARROW_BELOW_DP), they grow
 * with the widget's text scale, but the 4 x 2 can't be narrower than MEDIUM_MIN_WIDTH_DP.
 */
fun measureWidths(look: List<Float>, fontScale: Float): List<Float> {
  val scale = widgetScale(fontScale).coerceAtLeast(1f)
  return look.map { if (it == MEDIUM_MIN_WIDTH_DP) it else it * scale }.distinct().sorted()
}

// A 4 x 2 on a 5-column home screen is about 290 dp wide.
val SMALL_TOP_WIDTHS = listOf(MEDIUM_MIN_WIDTH_DP, 260f, 280f, NARROW_BELOW_DP, 340f)
val BIG_TOP_WIDTHS = listOf(NARROW_BELOW_DP, 340f)
/**
 * The 2 x 2's widths (dp), the same at every text size: the measuring tells where a text would
 * be cut. Real 2 x 2s are 135-170 dp wide; Vietnamese "Không có cảnh báo" wraps around 140-150.
 */
val SMALL_WIDTHS = listOf(110f, SMALL_DETAILS_WIDTH_DP, 135f, 145f, 155f, 165f, 180f, 200f)

/** The height the row needs at [widthDp] (0: the launcher didn't say), or null where it's never shown. */
private fun List<Need>.heightAt(widthDp: Float): Float? =
    if (widthDp <= 0) firstOrNull()?.heightDp else lastOrNull { it.widthDp <= widthDp }?.heightDp

/**
 * How much the widget's text grows with the phone's font scale (Settings > Display > Font size):
 * like the phone's, up to MAX_FONT_SCALE. Beyond it the text can't fit (seen at 200 %: "100"
 * without its °, warnings cut off); the app's own screens keep growing.
 */
fun widgetScale(fontScale: Float) = fontScale.coerceAtMost(MAX_FONT_SCALE)

/**
 * The layout for a size in dp; in portrait, the launcher's smallest width and largest height (0:
 * it didn't say). Larger text needs more room, so the widths grow with the widget's text scale; the
 * heights come measured with it ([needs]). The row with wind and feels like shows whenever it fits
 * whole, on the 4 x 2 with the small top row if the big one leaves no room for it.
 */
fun layoutFor(
    small: Boolean,
    widthDp: Float,
    heightDp: Float,
    fontScale: Float = 1f,
    needs: Needs = defaultNeeds(fontScale),
): WidgetLayout {
  val scale = widgetScale(fontScale).coerceAtLeast(1f)
  if (small) {
    // The 2 x 2's two columns also need the width ("12 km/h" was cut to "12" at 130 %): measured
    // as an infinite need where they don't fit across.
    val need = needs.small.heightAt(widthDp)
    if (need != null && heightDp >= need) return WidgetLayout(narrow = false, details = true)
    val one = needs.smallOne.heightAt(widthDp)
    return WidgetLayout(
        narrow = false, details = false, oneValue = oneValueAllowed(fontScale) && one != null && heightDp >= one)
  }
  val narrow = widthDp > 0 && widthDp < NARROW_BELOW_DP * scale
  val bigTop = if (narrow) null else needs.bigTop.heightAt(widthDp)
  val smallTop = needs.smallTop.heightAt(widthDp)
  return when {
    bigTop != null && heightDp >= bigTop -> WidgetLayout(narrow = false, details = true)
    smallTop != null && heightDp >= smallTop -> WidgetLayout(narrow, details = true, short = !narrow)
    else -> WidgetLayout(narrow, details = false)
  }
}

/**
 * Android 12+: the sizes (width to height, dp) where the layout changes. Of those that fit, the
 * launcher draws the one closest to the widget's size, also after a resize or a change of grid,
 * without asking the app. That is always one that looks right for the widget's own size: a size
 * with the row is closer than any size without it, and both top rows have a size at the same wide
 * widths, so the big one wins wherever it fits (short of widgets over a thousand dp tall).
 */
fun layoutSizes(small: Boolean, fontScale: Float = 1f, needs: Needs = defaultNeeds(fontScale)): List<Pair<Float, Float>> {
  val sizes = mutableListOf(1f to 1f)
  // The 2 x 2: without the details row, or with it once wide and tall enough.
  if (small) {
    sizes += needs.small.sizes()
    // Measured at the same widths as the row, so the row wins wherever it fits.
    if (oneValueAllowed(fontScale)) sizes += needs.smallOne.sizes()
    return sizes.distinct()
  }
  sizes += NARROW_BELOW_DP * widgetScale(fontScale).coerceAtLeast(1f) to 1f
  sizes += needs.smallTop.sizes()
  sizes += needs.bigTop.sizes()
  return sizes.distinct()
}

/**
 * The widget's size as the launcher reports it (dp), or null if it doesn't say: on Android 12+ the
 * smallest of its sizes (portrait and landscape, so never more than the widget has), else its
 * smallest width and largest height (the portrait size, as Android documents it).
 */
fun reportedSize(sizes: List<Pair<Float, Float>>, minWidth: Int, maxHeight: Int): Pair<Float, Float>? =
    when {
      sizes.isNotEmpty() -> sizes.minOf { it.first } to sizes.minOf { it.second }
      minWidth > 0 && maxHeight > 0 -> minWidth.toFloat() to maxHeight.toFloat()
      else -> null
    }

/**
 * Android 12+: the layout for each of [layoutSizes]. The smallest size gets the layout for the
 * size the launcher reports ([reported]): some launchers always draw the smallest one, however
 * much room the widget has (seen on a POCO, with Xiaomi's launcher, whose guide tells apps to pick
 * the layout from the reported size). A launcher that picks properly only draws the smallest size
 * when the widget is smaller than every other one, and then so is the reported size: nothing
 * changes there.
 */
fun layoutsBySize(
    small: Boolean,
    fontScale: Float,
    needs: Needs,
    reported: Pair<Float, Float>?,
): List<Pair<Pair<Float, Float>, WidgetLayout>> =
    layoutSizes(small, fontScale, needs).map { size ->
      val (width, height) = if (size == SMALLEST && reported != null) reported else size
      size to layoutFor(small, width, height, fontScale, needs)
    }

/** The first of [layoutSizes]: what a launcher draws when no other size fits. */
private val SMALLEST = 1f to 1f

/** Where the row ever fits: an infinite height means it doesn't fit across at that width. */
private fun List<Need>.sizes() = filter { it.heightDp.isFinite() }.map { it.widthDp to it.heightDp }

/** Narrower than this (dp, at font scale 1), the 4 x 2's top row is too tight at its full size. */
const val NARROW_BELOW_DP = 300f
/** The 4 x 2 can't be made narrower (minResizeWidth in widget_medium_info.xml). */
const val MEDIUM_MIN_WIDTH_DP = 220f
/** [defaultNeeds] at font scale 1 (dp). */
const val SMALL_TOP_DETAILS_DP = 144f
const val BIG_TOP_DETAILS_DP = 165f
const val SMALL_DETAILS_DP = 144f
/** The 2 x 2's details row fits from this width (dp, at font scale 1). */
const val SMALL_DETAILS_WIDTH_DP = 125f
const val MAX_FONT_SCALE = 1.3f

/** The background check runs about every 30 minutes; a few missed runs are fine. */
const val STALE_AFTER_MS = 3 * 60 * 60 * 1000L

/** A phone clock set back a little shouldn't make a fresh check look like it's from the future. */
private const val CLOCK_SLACK_MS = 10 * 60 * 1000L

/** Least to most serious; maxByOrNull keeps the first of equals, so the server's order wins. */
private val SEVERITY_ORDER = listOf("info", "moderate", "high", "severe")
