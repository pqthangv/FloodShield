package com.floodshield.app.alerts

/**
 * Plain rain: a moderate rain warning, or the morning "rain today" reminder. Its notification
 * shows a rain cloud instead of the "!" triangle: in a city it rains this much often. The same
 * categories as isCalmRain in services/format.ts (test_app_sync).
 */
object CalmRain {
  val CATEGORIES = setOf("heavy_rain", "urban_flood")

  // The reminders about rain (push.py): rain alone, or rain and strong sun in one. Strong sun
  // alone ("uv-today-") isn't rain.
  val REMINDER_IDS = listOf("rain-today-", "morning-")

  /** A missing category (an older server) keeps the "!". */
  fun isCalmRain(severity: String, category: String) = severity == "moderate" && category in CATEGORIES

  fun isRainReminder(id: String) = REMINDER_IDS.any { id.startsWith(it) }
}
