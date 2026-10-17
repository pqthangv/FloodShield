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
  fun `wind and feels-like only when there is room, from the limit on`() {
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 0f).details) // not said
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 110f).details)
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = MEDIUM_DETAILS_DP - 1).details)
    assertEquals(true, layoutFor(small = false, widthDp = 330f, heightDp = MEDIUM_DETAILS_DP).details)
    assertEquals(false, layoutFor(small = true, widthDp = 160f, heightDp = SMALL_DETAILS_DP - 1).details)
    assertEquals(true, layoutFor(small = true, widthDp = 160f, heightDp = SMALL_DETAILS_DP).details)
    // A real 2 x 2 is often 130-150 dp tall: the row now fits there (it needed 150).
    assertEquals(true, layoutFor(small = true, widthDp = 160f, heightDp = 140f).details)
    // A tablet.
    assertEquals(true, layoutFor(small = false, widthDp = 900f, heightDp = 600f).details)
  }

  @Test
  fun `the 4 x 2 gets the smaller top row when narrow, like on a 5-column home screen`() {
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 120f).narrow) // 4 columns
    assertEquals(true, layoutFor(small = false, widthDp = 290f, heightDp = 120f).narrow) // 5 columns
    assertEquals(true, layoutFor(small = false, widthDp = NARROW_BELOW_DP - 1, heightDp = 120f).narrow)
    assertEquals(false, layoutFor(small = false, widthDp = NARROW_BELOW_DP, heightDp = 120f).narrow)
    // The launcher didn't say: the usual layout.
    assertEquals(false, layoutFor(small = false, widthDp = 0f, heightDp = 0f).narrow)
    // The 2 x 2 has one top row only.
    assertEquals(false, layoutFor(small = true, widthDp = 100f, heightDp = 120f).narrow)
  }

  @Test
  fun `larger text needs more room`() {
    // 330 dp is wide enough at normal text, not with text 30 % larger (Display > Font size).
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 170f).narrow)
    assertEquals(true, layoutFor(small = false, widthDp = 330f, heightDp = 170f, fontScale = 1.3f).narrow)
    assertEquals(true, layoutFor(small = false, widthDp = 330f, heightDp = 170f).details)
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 170f, fontScale = 1.3f).details)
    // Smaller text than normal doesn't lower the limits.
    assertEquals(layoutFor(false, 290f, 150f), layoutFor(false, 290f, 150f, fontScale = 0.85f))
  }

  @Test
  fun `the widget's text grows with the phone's up to 130 percent, then stays`() {
    assertEquals(1f, widgetScale(1f))
    assertEquals(0.85f, widgetScale(0.85f))
    assertEquals(1.15f, widgetScale(1.15f))
    assertEquals(MAX_FONT_SCALE, widgetScale(1.3f))
    assertEquals(MAX_FONT_SCALE, widgetScale(2f))
    // So at 200 % it is laid out as at 130 % (at 200 % "100°" lost its ° and warnings were cut).
    for ((w, h) in listOf(290f to 231f, 368f to 223f, 137f to 231f)) {
      assertEquals(layoutFor(false, w, h, 1.3f), layoutFor(false, w, h, 2f))
      assertEquals(layoutFor(true, w, h, 1.3f), layoutFor(true, w, h, 2f))
    }
  }

  @Test
  fun `the 2 x 2's wind row also needs the width`() {
    // The 5-column emulator's 2 x 2: 137 x 231 dp.
    assertEquals(true, layoutFor(small = true, widthDp = 137f, heightDp = 231f).details)
    // At 130 % its two columns don't fit ("12 km/h" was cut to "12"): hidden, never cut.
    assertEquals(false, layoutFor(small = true, widthDp = 137f, heightDp = 231f, fontScale = 1.3f).details)
    assertEquals(false, layoutFor(small = true, widthDp = SMALL_DETAILS_WIDTH_DP - 1, heightDp = 231f).details)
    assertEquals(true, layoutFor(small = true, widthDp = SMALL_DETAILS_WIDTH_DP, heightDp = 231f).details)
    // A launcher that doesn't tell the width: the height decides, as before.
    assertEquals(true, layoutFor(small = true, widthDp = 0f, heightDp = 231f).details)
  }

  @Test
  fun `Android 12+ gets a layout at every size where it changes`() {
    for (small in listOf(false, true)) {
      for (scale in listOf(0.85f, 1f, 1.3f, 2f)) {
        val sizes = layoutSizes(small, scale)
        val layouts = sizes.map { (w, h) -> layoutFor(small, w, h, scale) }.toSet()
        // Every combination the size rules can give is among them, from the smallest size up.
        val expected = if (small) 2 else 4
        assertEquals(expected, layouts.size)
        assertEquals(1f to 1f, sizes.first())
        // And each size, made a bit smaller, falls back to a different layout: they are the limits.
        for ((w, h) in sizes.drop(1)) {
          val below = layoutFor(small, if (w > 1f) w - 1 else w, if (h > 1f) h - 1 else h, scale)
          assertEquals(false, below == layoutFor(small, w, h, scale))
        }
      }
    }
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
