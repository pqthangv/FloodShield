"""The FloodShield server for the store screenshots, with a clear sunny sky.

The weather on screen would be the real weather in Huế at that moment, which can be anything. So
this copy of the server shows a sunny afternoon as the current weather (the smiling sun looks best
in the store); the sample warning is about heavy rain from tonight (demo_data.py), which fits it.
Only that changes: the hourly and daily forecast, the river and the automatic warnings stay real.
Only the screenshot runs start it (.github/workflows/ios.yml); the live server runs main:app and
never loads this file.

The sun on the sunrise/sunset curve follows the phone's real clock, so take the screenshots in the
daytime in Vietnam (about 09:00-14:00, 02:00-07:00 UTC).

Usage, from backend/: python -m uvicorn --app-dir ../mobile/.maestro demo_server:app --port 8000
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from main import app  # noqa: E402,F401
from services import weather  # noqa: E402

SUNNY = {
    "weather_code": 0,  # "Trời quang" / "Clear sky": the smiling sun
    "temperature_2m": 30.2,
    "apparent_temperature": 34.1,
    "relative_humidity_2m": 66,
    "precipitation": 0,
    "is_day": 1,  # daytime, whatever the hour of the run
}

real_normalize_forecast = weather.normalize_forecast


def sunny_normalize_forecast(raw: dict, *args, **kwargs) -> dict:
    return real_normalize_forecast({**raw, "current": {**raw.get("current", {}), **SUNNY}}, *args, **kwargs)


weather.normalize_forecast = sunny_normalize_forecast
