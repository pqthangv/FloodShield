"""The phone downloads the Open-Meteo forecast itself and the server reads it (see weather.py).
The app (TypeScript) and the background worker (Kotlin) must ask for the same variables."""

import re
from pathlib import Path

import pytest

from services import weather

MOBILE = Path(__file__).resolve().parents[2] / "mobile"
COPIES = [
    MOBILE / "services" / "openMeteo.ts",
    MOBILE / "android/app/src/main/java/com/floodshield/app/alerts/AlertWorker.kt",
]
EXPECTED = {
    "FORECAST_URL": weather.FORECAST_URL,
    "CURRENT_VARS": weather.CURRENT_VARS,
    "HOURLY_VARS": weather.HOURLY_VARS,
    "DAILY_VARS": weather.DAILY_VARS,
}


def constant(source: str, name: str) -> str:
    """The value of `NAME = "a" + "b"` (several string pieces joined, as both files write them)."""
    found = re.search(rf"{name}\s*=\s*((?:\s*\+?\s*(['\"])[^'\"]*\2)+)", source)
    assert found, f"{name} not found"
    return "".join(piece[1] for piece in re.findall(r"(['\"])([^'\"]*)\1", found.group(1)))


@pytest.mark.parametrize("path", COPIES, ids=lambda p: p.name)
def test_app_asks_open_meteo_for_what_the_server_reads(path):
    if not path.exists():
        pytest.skip("mobile app not checked out")
    source = path.read_text(encoding="utf-8")
    for name, value in EXPECTED.items():
        assert constant(source, name) == value, f"{name} in {path.name} differs from weather.py"
