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

  /**
   * Like measured on the emulator in Vietnamese (a long "all clear" and place): narrower needs
   * more. The 4 x 2 with the small / big top row, the 2 x 2.
   */
  private val needs =
      Needs(
          smallTop = listOf(Need(220f, 157f), Need(260f, 150f), Need(300f, 144f), Need(340f, 144f)),
          bigTop = listOf(Need(300f, 173f), Need(340f, 165f)),
          small = listOf(Need(125f, 149f), Need(140f, 144f), Need(160f, 144f)),
      )

  @Test
  fun `wind and feels-like only when the row fits whole, from the measured height on`() {
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 0f, needs = needs).details) // not said
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 110f, needs = needs).details)
    assertEquals(false, layoutFor(small = false, widthDp = 330f, heightDp = 143f, needs = needs).details)
    assertEquals(true, layoutFor(small = false, widthDp = 330f, heightDp = 144f, needs = needs).details)
    assertEquals(false, layoutFor(small = true, widthDp = 160f, heightDp = 143f, needs = needs).details)
    assertEquals(true, layoutFor(small = true, widthDp = 160f, heightDp = 144f, needs = needs).details)
    // A tablet.
    assertEquals(true, layoutFor(small = false, widthDp = 900f, heightDp = 600f, needs = needs).details)
  }

  @Test
  fun `a narrower widget may need more height, measured from the width it starts at`() {
    // The 2 x 2's "Không có cảnh báo" takes two lines below 140 dp wide.
    assertEquals(false, layoutFor(small = true, widthDp = 130f, heightDp = 148f, needs = needs).details)
    assertEquals(true, layoutFor(small = true, widthDp = 130f, heightDp = 149f, needs = needs).details)
    assertEquals(true, layoutFor(small = true, widthDp = 145f, heightDp = 144f, needs = needs).details)
    // Narrower than the first measured width: never the row (it may not fit across).
    assertEquals(false, layoutFor(small = true, widthDp = 124f, heightDp = 400f, needs = needs).details)
    assertEquals(false, layoutFor(small = false, widthDp = 219f, heightDp = 400f, needs = needs).details)
    // A narrow 4 x 2: the place and "Cập nhật" on two lines.
    assertEquals(false, layoutFor(small = false, widthDp = 240f, heightDp = 156f, needs = needs).details)
    assertEquals(true, layoutFor(small = false, widthDp = 240f, heightDp = 157f, needs = needs).details)
    assertEquals(true, layoutFor(small = false, widthDp = 290f, heightDp = 150f, needs = needs).details)
  }

  @Test
  fun `a launcher that doesn't tell the width gets the narrowest width's needs`() {
    assertEquals(false, layoutFor(small = true, widthDp = 0f, heightDp = 148f, needs = needs).details)
    assertEquals(true, layoutFor(small = true, widthDp = 0f, heightDp = 149f, needs = needs).details)
    assertEquals(
        WidgetLayout(narrow = false, details = true, short = true),
        layoutFor(small = false, widthDp = 0f, heightDp = 160f, needs = needs))
  }

  @Test
  fun `a short 4 x 2 shows the row with the small top row, a tall one with the big one`() {
    val short = layoutFor(small = false, widthDp = 335f, heightDp = 172f, needs = needs)
    assertEquals(WidgetLayout(narrow = false, details = true, short = true), short)
    assertEquals(true, short.smallTop)
    val tall = layoutFor(small = false, widthDp = 335f, heightDp = 173f, needs = needs)
    assertEquals(WidgetLayout(narrow = false, details = true, short = false), tall)
    assertEquals(false, tall.smallTop)
    // Wider, the big top row's warning fits on one line: it needs less.
    assertEquals(false, layoutFor(small = false, widthDp = 345f, heightDp = 165f, needs = needs).smallTop)
    // Too short for the row at all: the big top row, without it.
    assertEquals(
        WidgetLayout(narrow = false, details = false), layoutFor(small = false, widthDp = 335f, heightDp = 143f, needs = needs))
    // Narrow: the small top row at every height.
    assertEquals(
        WidgetLayout(narrow = true, details = true), layoutFor(small = false, widthDp = 290f, heightDp = 400f, needs = needs))
  }

  @Test
  fun `the 4 x 2's narrow widths stay put at every text size, the big top row's grow with it`() {
    assertEquals(listOf(220f, 240f, 260f, 280f, 300f, 340f), smallTopWidths(1f))
    assertEquals(listOf(220f, 240f, 260f, 280f, 300f, 340f), smallTopWidths(0.85f))
    assertEquals(listOf(300f, 340f), bigTopWidths(1f))
    assertEquals(listOf(300f * 1.3f, 340f * 1.3f), bigTopWidths(1.3f))
    assertEquals(listOf(220f, 240f, 260f, 280f, 300f, 340f, 300f * 1.3f, 340f * 1.3f), smallTopWidths(1.3f))
    assertEquals(smallTopWidths(1.3f), smallTopWidths(2f))
    // Both top rows are measured at the same wide widths (layoutSizes relies on it).
    for (scale in listOf(0.85f, 1f, 1.15f, 1.3f, 2f)) {
      val wide = smallTopWidths(scale).filter { it >= NARROW_BELOW_DP * widgetScale(scale).coerceAtLeast(1f) }
      assertEquals(bigTopWidths(scale), wide)
    }
  }

  @Test
  fun `at large text a 5-column 4 x 2 is measured close to its own width`() {
    // 292 dp wide: at 130 % it was measured at 220 dp only (where the row is cut), so no row.
    for (scale in listOf(1f, 1.15f, 1.3f, 2f)) {
      val below = smallTopWidths(scale).filter { it <= 292f }
      assertEquals("font $scale", 280f, below.max())
    }
  }

  @Test
  fun `the first friend's 4 x 2 (335 x 158 dp) gets the row`() {
    assertEquals(true, layoutFor(small = false, widthDp = 335f, heightDp = 158f).details)
  }

  @Test
  fun `a 2 x 2 too short for the whole row doesn't show half of it`() {
    // At 135-140 dp the old limit (130) showed it, and "12 km/h" was cut in half.
    assertEquals(false, layoutFor(small = true, widthDp = 160f, heightDp = 135f).details)
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
        // The measured example is for normal-size text; the defaults follow the text scale.
        for (n in listOfNotNull(needs.takeIf { widgetScale(scale) <= 1f }, defaultNeeds(scale))) {
          val sizes = layoutSizes(small, scale, n)
          val looks = sizes.map { (w, h) -> look(layoutFor(small, w, h, scale, n)) }.toSet()
          // Every look the size rules can give is among them, from the smallest size up.
          val expected = if (small) 2 else 4
          assertEquals(expected, looks.size)
          assertEquals(1f to 1f, sizes.first())
          // Android takes at most 16, each size once.
          assertEquals(true, sizes.size <= 16)
          assertEquals(sizes.size, sizes.toSet().size)
          // And each size, made a bit smaller, falls back to a different layout: they are the limits.
          for ((w, h) in sizes.drop(1)) {
            val below = layoutFor(small, if (w > 1f) w - 1 else w, if (h > 1f) h - 1 else h, scale, n)
            assertEquals(false, below == layoutFor(small, w, h, scale, n))
          }
        }
      }
    }
  }

  /**
   * What the widget looks like: which top row, the row with wind and feels like or not, and the
   * 2 x 2's one-line "feels like" or not.
   */
  private fun look(layout: WidgetLayout) = Triple(layout.smallTop, layout.details, layout.oneValue)

  /**
   * Like measured at 130 % text: the 2 x 2's two columns only fit from 180 dp wide, the one-line
   * "feels like" from 125 dp (narrower, "CẢM THẤY" is cut).
   */
  private val large =
      Needs(
          smallTop = emptyList(),
          bigTop = emptyList(),
          small = listOf(110f, 125f, 135f, 145f, 155f, 165f).map { Need(it, Float.POSITIVE_INFINITY) } +
              listOf(Need(180f, 178f), Need(200f, 163f)),
          smallOne =
              listOf(Need(110f, Float.POSITIVE_INFINITY), Need(125f, 146f), Need(135f, 146f), Need(145f, 141f)) +
                  listOf(155f, 165f, 180f, 200f).map { Need(it, 141f) },
      )

  @Test
  fun `at large text a 2 x 2 without room for the row shows feels like alone, on one line`() {
    // The first friend's 2 x 2 (147 x 147 dp) at 130 %.
    assertEquals(
        WidgetLayout(narrow = false, details = false, oneValue = true),
        layoutFor(small = true, widthDp = 147f, heightDp = 147f, fontScale = 1.3f, needs = large))
    // Too short even for that line: nothing, as before.
    assertEquals(false, layoutFor(small = true, widthDp = 147f, heightDp = 140f, fontScale = 1.3f, needs = large).oneValue)
    // Too narrow for "CẢM THẤY 33°" on one line.
    assertEquals(false, layoutFor(small = true, widthDp = 115f, heightDp = 300f, fontScale = 1.3f, needs = large).oneValue)
    // Room for the two columns after all (a wide 2 x 2): the full row, not the one line.
    assertEquals(
        WidgetLayout(narrow = false, details = true),
        layoutFor(small = true, widthDp = 190f, heightDp = 180f, fontScale = 1.3f, needs = large))
  }

  @Test
  fun `at normal text the one line never shows, a 2 x 2 without room for the row stays as it was`() {
    for (scale in listOf(0.85f, 1f)) {
      assertEquals(false, layoutFor(small = true, widthDp = 147f, heightDp = 147f, fontScale = scale, needs = large).oneValue)
      assertEquals(listOf(1f to 1f, 180f to 178f, 200f to 163f), layoutSizes(small = true, fontScale = scale, needs = large))
    }
    assertEquals(true, oneValueAllowed(1.15f))
    assertEquals(false, oneValueAllowed(1f))
  }

  @Test
  fun `at large text the launcher's closest fitting size also looks right`() {
    fun drawn(w: Float, h: Float): WidgetLayout {
      val fitting = layoutSizes(true, 1.3f, large).filter { (lw, lh) -> lw <= w && lh <= h }
      val (bw, bh) = fitting.minBy { (lw, lh) -> (w - lw) * (w - lw) + (h - lh) * (h - lh) }
      return layoutFor(true, bw, bh, 1.3f, large)
    }
    val looks = mutableSetOf<Triple<Boolean, Boolean, Boolean>>()
    for (w in listOf(110f, 124f, 125f, 137f, 145f, 166f, 179f, 180f, 199f, 200f, 400f)) {
      for (h in listOf(110f, 140f, 141f, 146f, 150f, 162f, 163f, 177f, 178f, 231f, 900f)) {
        val expected = look(layoutFor(true, w, h, 1.3f, large))
        assertEquals("2 x 2 at $w x $h", expected, look(drawn(w, h)))
        looks += expected
      }
    }
    // Nothing, the one line, and the full row all happen.
    assertEquals(3, looks.size)
  }

  @Test
  fun `the launcher's closest fitting size always looks right for the widget's size`() {
    // What Android 12+ does with the sizes (RemoteViews.findBestFitLayout).
    for (n in listOf(needs, defaultNeeds())) {
      fun drawn(small: Boolean, w: Float, h: Float): WidgetLayout {
        val fitting = layoutSizes(small, 1f, n).filter { (lw, lh) -> lw <= w && lh <= h }
        val (bw, bh) = fitting.minBy { (lw, lh) -> (w - lw) * (w - lw) + (h - lh) * (h - lh) }
        return layoutFor(small, bw, bh, 1f, n)
      }
      for (w in listOf(220f, 240f, 259f, 260f, 290f, 299f, 300f, 335f, 339f, 340f, 368f, 600f, 1200f)) {
        for (h in listOf(110f, 143f, 144f, 150f, 157f, 158f, 164f, 165f, 172f, 173f, 200f, 231f, 500f, 1000f)) {
          assertEquals("4 x 2 at $w x $h", look(layoutFor(false, w, h, 1f, n)), look(drawn(false, w, h)))
        }
      }
      for (w in listOf(110f, 124f, 125f, 137f, 139f, 140f, 166f, 400f)) {
        for (h in listOf(110f, 143f, 144f, 148f, 149f, 158f, 231f, 900f)) {
          assertEquals("2 x 2 at $w x $h", look(layoutFor(true, w, h, 1f, n)), look(drawn(true, w, h)))
        }
      }
    }
  }

  @Test
  fun `where the row doesn't fit across, it's never shown, however tall`() {
    // At 130 % text the 2 x 2's "12 km/h" was cut to "12 km/" at 165 dp wide.
    val inf = Float.POSITIVE_INFINITY
    val cut =
        Needs(
            smallTop = listOf(Need(220f, inf), Need(338f, 190f), Need(390f, 170f)),
            bigTop = listOf(Need(390f, inf)),
            small = listOf(Need(162.5f, inf), Need(175.5f, inf), Need(188.5f, 190f)))
    assertEquals(false, layoutFor(small = true, widthDp = 170f, heightDp = 900f, fontScale = 1.3f, needs = cut).details)
    assertEquals(true, layoutFor(small = true, widthDp = 190f, heightDp = 190f, fontScale = 1.3f, needs = cut).details)
    assertEquals(false, layoutFor(small = false, widthDp = 300f, heightDp = 900f, fontScale = 1.3f, needs = cut).details)
    // Wide, the big top row never gets the row there: the small one does.
    assertEquals(
        WidgetLayout(narrow = false, details = true, short = true),
        layoutFor(small = false, widthDp = 400f, heightDp = 900f, fontScale = 1.3f, needs = cut))
    // The launcher only gets sizes that can be drawn.
    for (small in listOf(true, false)) {
      val sizes = layoutSizes(small, 1.3f, cut) + layoutSizes(small, 1.3f, large)
      assertEquals(true, sizes.all { (w, h) -> w.isFinite() && h.isFinite() })
    }
    assertEquals(listOf(1f to 1f, 188.5f to 190f), layoutSizes(small = true, fontScale = 1.3f, needs = cut))
  }

  @Test
  fun `the reported size is the launcher's smallest, so never more than the widget has`() {
    // Pixel Launcher (Android 14, measured): the portrait size first, then others.
    val pixel = listOf(344.4f to 157.7f, 345.9f to 152.8f, 374.9f to 150.9f)
    assertEquals(344.4f to 150.9f, reportedSize(pixel, minWidth = 344, maxHeight = 157))
    // No list (older launchers): the portrait size, as Android documents it.
    assertEquals(328f to 163f, reportedSize(emptyList(), minWidth = 328, maxHeight = 163))
    // Nothing said.
    assertEquals(null, reportedSize(emptyList(), minWidth = 0, maxHeight = 0))
    assertEquals(null, reportedSize(emptyList(), minWidth = 328, maxHeight = 0))
  }

  @Test
  fun `a launcher that always draws the smallest size gets the layout for the size it reports`() {
    // The POCO's 4 x 2 and 2 x 2 (Xiaomi's launcher) have room for the row; it drew the
    // smallest size, which was always without it.
    val poco4x2 = layoutsBySize(small = false, fontScale = 1f, needs = needs, reported = 328f to 163f)
    assertEquals(1f to 1f, poco4x2.first().first)
    assertEquals(WidgetLayout(narrow = false, details = true, short = true), poco4x2.first().second)
    val poco2x2 = layoutsBySize(small = true, fontScale = 1f, needs = needs, reported = 145f to 160f)
    assertEquals(WidgetLayout(narrow = false, details = true), poco2x2.first().second)
    // The other sizes keep their own layouts.
    for ((size, layout) in poco4x2.drop(1)) {
      assertEquals(layoutFor(false, size.first, size.second, 1f, needs), layout)
    }
    // No reported size: the smallest stays the smallest layout.
    assertEquals(
        layoutFor(false, 1f, 1f, 1f, needs), layoutsBySize(false, 1f, needs, reported = null).first().second)
  }

  @Test
  fun `on a launcher that picks the size properly, the reported size changes nothing`() {
    // The reported size is never more than the widget has (reportedSize): the real size, or less.
    for (n in listOf(needs, defaultNeeds())) {
      for (small in listOf(false, true)) {
        val widths = if (small) listOf(110f, 124f, 125f, 137f, 140f, 166f, 400f) else listOf(220f, 259f, 290f, 299f, 300f, 335f, 600f)
        for (w in widths) {
          for (h in listOf(110f, 143f, 144f, 149f, 157f, 158f, 165f, 173f, 231f, 900f)) {
            for (reported in listOf(w to h, w - 20f to h - 10f, w to h - 25f)) {
              val sizes = layoutsBySize(small, 1f, n, reported)
              val fitting = sizes.filter { (size, _) -> size.first <= w && size.second <= h }
              val drawn =
                  fitting.minBy { (size, _) -> (w - size.first) * (w - size.first) + (h - size.second) * (h - size.second) }
              assertEquals("$small $w x $h, reported $reported", look(layoutFor(small, w, h, 1f, n)), look(drawn.second))
            }
          }
        }
      }
    }
  }

  @Test
  fun `if the big top row ever needs no more than the small one, it's used from there`() {
    val odd =
        Needs(
            smallTop = listOf(Need(220f, 150f), Need(300f, 150f)),
            bigTop = listOf(Need(300f, 150f)),
            small = emptyList())
    assertEquals(4, layoutSizes(small = false, needs = odd).size)
    assertEquals(WidgetLayout(narrow = false, details = true), layoutFor(false, 335f, 150f, needs = odd))
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
