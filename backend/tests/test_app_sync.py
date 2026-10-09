"""The phone downloads the Open-Meteo forecast and the Overpass places itself, and the server
reads them (see weather.py, osm.py). The app (TypeScript) and the background worker (Kotlin)
must ask for the same data the server expects."""

import re
from pathlib import Path

import pytest

from services import osm, weather

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


OVERPASS_TS = MOBILE / "services" / "overpass.ts"


def test_app_asks_overpass_for_what_the_server_would():
    if not OVERPASS_TS.exists():
        pytest.skip("mobile app not checked out")
    source = OVERPASS_TS.read_text(encoding="utf-8")
    server = osm._overpass_query(16.46, 107.58, 6.5)
    selectors = lambda text: sorted(set(re.findall(r'nwr\[.*?\];', text)))
    assert selectors(source) == selectors(server)
    for part in ("[out:json][timeout:25]", "out center tags;"):
        assert part in source and part in server
    assert re.findall(r"'(https://[^']+/interpreter)'", source) == osm.OVERPASS_URLS


def test_app_keeps_every_tag_the_server_reads():
    if not OVERPASS_TS.exists():
        pytest.skip("mobile app not checked out")
    kept = set(re.findall(r"'([a-z:_]+)'", re.search(r"KEEP_TAGS = \[(.*?)\]", OVERPASS_TS.read_text(encoding="utf-8"), re.S).group(1)))
    read = set(re.findall(r'tags\.get\("([^"]+)"', Path(osm.__file__).read_text(encoding="utf-8")))
    assert read and read <= kept, f"overpass.ts drops tags the server reads: {read - kept}"
