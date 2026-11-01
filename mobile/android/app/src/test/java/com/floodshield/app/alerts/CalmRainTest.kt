package com.floodshield.app.alerts

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CalmRainTest {
  @Test
  fun `a moderate rain warning is plain rain`() {
    assertTrue(CalmRain.isCalmRain("moderate", "heavy_rain"))
    assertTrue(CalmRain.isCalmRain("moderate", "urban_flood"))
  }

  @Test
  fun `stronger rain and other warnings keep the warning icon`() {
    for (severity in listOf("info", "high", "severe")) {
      assertFalse(CalmRain.isCalmRain(severity, "heavy_rain"))
      assertFalse(CalmRain.isCalmRain(severity, "urban_flood"))
    }
    for (category in listOf("storm", "wind", "heat", "flood", "landslide")) {
      assertFalse(CalmRain.isCalmRain("moderate", category))
    }
  }

  @Test
  fun `without a category (a server before 1_0_9) the warning icon stays`() {
    assertFalse(CalmRain.isCalmRain("moderate", ""))
  }

  @Test
  fun `the rain reminders are rain, strong sun alone is not`() {
    assertTrue(CalmRain.isRainReminder("rain-today-2026-10-31"))
    assertTrue(CalmRain.isRainReminder("morning-2026-10-31"))
    assertFalse(CalmRain.isRainReminder("uv-today-2026-10-31"))
    assertFalse(CalmRain.isRainReminder(""))
  }

  @Test
  fun `only strong sun alone is the sun reminder`() {
    assertTrue(CalmRain.isSunReminder("uv-today-2026-10-31"))
    // Rain and strong sun in one shows the rain cloud.
    assertFalse(CalmRain.isSunReminder("morning-2026-10-31"))
    assertFalse(CalmRain.isSunReminder("rain-today-2026-10-31"))
    assertFalse(CalmRain.isSunReminder(""))
  }
}
