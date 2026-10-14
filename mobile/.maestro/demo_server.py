"""The FloodShield server for the store screenshots, with a rainy sky.

The sample warning is about heavy rain (demo_data.py), but the weather on screen would be the real
weather in Huế at that moment, often sunny. So this copy of the server shows moderate rain, in the
daytime, as the current weather. Only that changes: the hourly and daily forecast, the river and
the automatic warnings stay real. Only the screenshot runs start it (.github/workflows/ios.yml); the
live server runs main:app and never loads this file.

Usage, from backend/: python -m uvicorn --app-dir ../mobile/.maestro demo_server:app --port 8000
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from main import app  # noqa: E402,F401
from services import weather  # noqa: E402

RAIN = {
    "weather_code": 63,  # "Mưa vừa" / "Moderate rain": the rain picture
    "temperature_2m": 25.4,
    "apparent_temperature": 28.1,
    "relative_humidity_2m": 92,
    "precipitation": 2.3,
    "is_day": 1,  # daytime, whatever the hour of the run
}

real_normalize_forecast = weather.normalize_forecast


def rainy_normalize_forecast(raw: dict, *args, **kwargs) -> dict:
    return real_normalize_forecast({**raw, "current": {**raw.get("current", {}), **RAIN}}, *args, **kwargs)


weather.normalize_forecast = rainy_normalize_forecast
