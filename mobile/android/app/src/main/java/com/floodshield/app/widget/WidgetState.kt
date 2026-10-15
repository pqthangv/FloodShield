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

/** The background check runs about every 30 minutes; a few missed runs are fine. */
const val STALE_AFTER_MS = 3 * 60 * 60 * 1000L

/** A phone clock set back a little shouldn't make a fresh check look like it's from the future. */
private const val CLOCK_SLACK_MS = 10 * 60 * 1000L

/** Least to most serious; maxByOrNull keeps the first of equals, so the server's order wins. */
private val SEVERITY_ORDER = listOf("info", "moderate", "high", "severe")
