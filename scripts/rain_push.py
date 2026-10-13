"""Hourly job for rain warnings by push notification (.github/workflows/rain-push.yml).

The FloodShield server can't download forecasts itself: Open-Meteo's free limit is per IP
address, and the server's address is shared with many other apps. So this job asks the server
which areas have phones registered, downloads their forecasts (many places per request), and
posts them back; the server sends the warnings (backend/services/push.py).

Needs FLOODSHIELD_API (e.g. https://floodshield-api-ese8.onrender.com/api/v1) and PUSH_JOB_TOKEN
(the server's PUSH_JOB_TOKEN, which only opens the /push/job endpoints).
Only the Python standard library, so the job installs nothing.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Only what the rain rules read (services/alerts.py: rain_alerts, intense_rain_alert, and
# services/push.py: rain_reminder): the current local time, hourly rain and its chance, and daily
# rain, for the next 3 days.
CURRENT_VARS = "precipitation"
HOURLY_VARS = "precipitation,precipitation_probability"
DAILY_VARS = "precipitation_sum"
FORECAST_DAYS = 3
# Places per Open-Meteo request, and per post to the server.
BATCH = 100
USER_AGENT = "FloodShield rain-push job (https://github.com/pqthangv/FloodShield)"


def call(url, body=None, headers=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})})
    if data is not None:
        request.add_header("Content-Type", "application/json")
        request.get_method = lambda: "POST"
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def forecasts_for(areas):
    query = urllib.parse.urlencode({
        "latitude": ",".join(str(a["latitude"]) for a in areas),
        "longitude": ",".join(str(a["longitude"]) for a in areas),
        "current": CURRENT_VARS,
        "hourly": HOURLY_VARS,
        "daily": DAILY_VARS,
        "timezone": "auto",
        "forecast_days": FORECAST_DAYS,
    })
    found = call(f"{FORECAST_URL}?{query}")
    # One place gives one object, several places a list in the same order.
    found = found if isinstance(found, list) else [found]
    if len(found) != len(areas):
        raise RuntimeError(f"Open-Meteo returned {len(found)} forecasts for {len(areas)} areas")
    return [{"latitude": a["latitude"], "longitude": a["longitude"], "forecast": f} for a, f in zip(areas, found)]


def main():
    api = os.environ["FLOODSHIELD_API"].rstrip("/")
    job = {"X-Push-Job-Token": os.environ["PUSH_JOB_TOKEN"]}
    areas = call(f"{api}/push/job/areas", headers=job)["areas"]
    print(f"{len(areas)} areas with phones")
    totals = {}
    for start in range(0, len(areas), BATCH):
        batch = forecasts_for(areas[start:start + BATCH])
        result = call(f"{api}/push/job/rain", body={"forecasts": batch}, headers=job)
        for key, value in result.items():
            totals[key] = totals.get(key, 0) + value
    print(json.dumps(totals))
    # Bad forecasts or failed sends make the job fail, so GitHub e-mails the owner.
    if totals.get("bad_forecasts") or totals.get("failed"):
        sys.exit(1)


if __name__ == "__main__":
    main()
