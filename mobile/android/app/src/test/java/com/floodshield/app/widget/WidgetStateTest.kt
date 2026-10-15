package com.floodshield.app.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetStateTest {
  private val now = 1_800_000_000_000L
  private val minute = 60_000L

  @Test
  fun `nothing checked yet is neither a warning nor all clear`() {
    assertEquals(Band.Unknown, bandFor(null, now))
    assertEquals(Band.Unknown, bandFor(Snapshot(place = "Huế", temperature = 25.0), now))
  }

  @Test
  fun `a recent check without alerts is all clear`() {
    assertEquals(Band.Clear, bandFor(Snapshot(alerts = emptyList(), checkedAt = now - 20 * minute), now))
  }

  @Test
  fun `an old check is not shown as all clear, nor as a warning`() {
    val old = now - STALE_AFTER_MS - minute
    assertEquals(Band.Unknown, bandFor(Snapshot(alerts = emptyList(), checkedAt = old), now))
    assertEquals(Band.Unknown, bandFor(Snapshot(alerts = listOf(SnapshotAlert("Mưa to", "high")), checkedAt = old), now))
    // A check "from the future" (clock changed) isn't trusted either.
    assertEquals(Band.Unknown, bandFor(Snapshot(alerts = emptyList(), checkedAt = now + 60 * minute), now))
  }

  @Test
  fun `the most serious warning is shown, with how many others`() {
    val alerts =
        listOf(
            SnapshotAlert("Gió mạnh", "moderate"),
            SnapshotAlert("Mưa rất to", "severe"),
            SnapshotAlert("Lũ", "severe"),
            SnapshotAlert("Nắng nóng", "info"))
    assertEquals(
        Band.Warning("Mưa rất to", "severe", others = 3), bandFor(Snapshot(alerts = alerts, checkedAt = now), now))
  }
}
