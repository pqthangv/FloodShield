"""The phone downloads the Open-Meteo forecast and the Overpass places itself, and the server
reads them (see weather.py, osm.py). The app (TypeScript) and the background worker (Kotlin)
must ask for the same data the server expects."""

import inspect
import json
import re
from pathlib import Path

import pytest

from services import alerts, flood, osm, weather

MOBILE = Path(__file__).resolve().parents[2] / "mobile"
RAIN_JOB = Path(__file__).resolve().parents[2] / "scripts" / "rain_push.py"
COPIES = [
    MOBILE / "services" / "openMeteo.ts",
    MOBILE / "android/app/src/main/java/com/floodshield/app/alerts/AlertWorker.kt",
    MOBILE / "ios/FloodShield/FSAlertScheduler.mm",
]
EXPECTED = {
    "FORECAST_URL": weather.FORECAST_URL,
    "CURRENT_VARS": weather.CURRENT_VARS,
    "HOURLY_VARS": weather.HOURLY_VARS,
    "DAILY_VARS": weather.DAILY_VARS,
}


def constant(source: str, name: str) -> str:
    """The value of `NAME = "a" + "b"` (TypeScript, Kotlin) or `NAME = @"a" @"b"` (Objective-C):
    several string pieces joined."""
    found = re.search(rf"{name}\s*=\s*((?:\s*\+?\s*@?(['\"])[^'\"]*\2)+)", source)
    assert found, f"{name} not found"
    return "".join(piece[1] for piece in re.findall(r"(['\"])([^'\"]*)\1", found.group(1)))


@pytest.mark.parametrize("path", COPIES, ids=lambda p: p.name)
def test_app_asks_open_meteo_for_what_the_server_reads(path):
    if not path.exists():
        pytest.skip("mobile app not checked out")
    source = path.read_text(encoding="utf-8")
    for name, value in EXPECTED.items():
        assert constant(source, name) == value, f"{name} in {path.name} differs from weather.py"
    # The app and the background worker round the location the same way (the privacy policy says ~1 km).
    assert re.search(r"SNAP_STEP\s*=\s*0\.01\b", source), f"SNAP_STEP in {path.name} is not 0.01"


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


def test_one_version_number_everywhere():
    """Settings shows APP_VERSION; the stores show versionName (Android) and MARKETING_VERSION (iOS)."""
    config = MOBILE / "config.ts"
    if not config.exists():
        pytest.skip("mobile app not checked out")
    version = re.search(r"APP_VERSION = '([^']+)'", config.read_text(encoding="utf-8")).group(1)
    assert json.loads((MOBILE / "package.json").read_text(encoding="utf-8"))["version"] == version
    gradle = (MOBILE / "android/app/build.gradle").read_text(encoding="utf-8")
    assert re.search(r'versionName "([^"]+)"', gradle).group(1) == version
    xcode = (MOBILE / "ios/FloodShield.xcodeproj/project.pbxproj").read_text(encoding="utf-8")
    assert set(re.findall(r"MARKETING_VERSION = ([^;]+);", xcode)) == {version}
    # The iOS background check names the same version when it calls Open-Meteo.
    assert f'"FloodShield/{version} (iOS app;' in (MOBILE / "ios/FloodShield/FSAlertScheduler.mm").read_text(encoding="utf-8")


GLOFAS_TS = MOBILE / "services" / "glofas.ts"
GLOFAS_FIXTURE = MOBILE / "__tests__" / "fixtures" / "glofas.json"


def test_app_downloads_the_river_data_the_server_would():
    """The phone downloads the GloFAS data itself (glofas.ts); flood.py analyses it."""
    if not GLOFAS_TS.exists():
        pytest.skip("mobile app not checked out")
    source = GLOFAS_TS.read_text(encoding="utf-8")
    for name in ("FLOOD_URL", "FORECAST_VARS"):
        assert constant(source, name) == getattr(flood, name), f"{name} in glofas.ts differs from flood.py"
    for name in ("GRID_STEP", "GRID_RADIUS", "SEARCH_SNAP", "MIN_RIVER_DISCHARGE", "HISTORY_YEARS",
                 "PAST_DAYS", "FORECAST_DAYS"):
        found = re.search(rf"export const {name} = ([\d.]+);", source)
        assert found and float(found.group(1)) == float(getattr(flood, name)), f"{name} differs"


@pytest.mark.parametrize("path", COPIES[1:], ids=lambda p: p.name)
def test_background_checkers_download_the_river_forecast_the_server_reads(path):
    """AlertWorker.kt and FSAlertScheduler.mm download the forecast of the river the app found."""
    if not path.exists():
        pytest.skip("mobile app not checked out")
    source = path.read_text(encoding="utf-8")
    for name in ("FLOOD_URL", "FORECAST_VARS"):
        assert constant(source, name) == getattr(flood, name), f"{name} in {path.name} differs from flood.py"
    for name in ("PAST_DAYS", "FORECAST_DAYS"):
        found = re.search(rf"{name} = (\d+);?\n", source)
        assert found and int(found.group(1)) == getattr(flood, name), f"{name} in {path.name} differs"


def test_server_gives_the_answers_the_app_tests_expect():
    """glofas.test.ts checks the app's copies against the same sample and answers."""
    if not GLOFAS_FIXTURE.exists():
        pytest.skip("mobile app not checked out")
    sample = json.loads(GLOFAS_FIXTURE.read_text(encoding="utf-8"))
    assert flood.pick_river_cell(sample["cells"], *sample["snapped"]) == sample["expected_cell"]
    history = sample["history"]
    assert flood.annual_maxima(history["time"], history["river_discharge"]) == sample["expected_maxima"]


def test_rain_job_downloads_what_the_rain_rules_read():
    """The hourly push job (scripts/rain_push.py) asks Open-Meteo only for what rain_alerts and
    intense_rain_alert read; a new value read there must be added to the job too."""
    job = RAIN_JOB.read_text(encoding="utf-8")
    asks = lambda name: set(re.search(rf'^{name} = "([^"]*)"', job, re.M).group(1).split(","))
    rules = inspect.getsource(alerts.rain_alerts) + inspect.getsource(alerts.intense_rain_alert)
    reads = lambda part: set(re.findall(rf'{part}\.get\("([^"]+)"', rules)) - {"time"}
    assert reads("daily") <= asks("DAILY_VARS")
    assert reads("hourly") <= asks("HOURLY_VARS")
    # The same names as the phones' request, so the server reads both the same way.
    for name in ("CURRENT_VARS", "HOURLY_VARS", "DAILY_VARS"):
        assert asks(name) <= set(getattr(weather, name).split(","))
