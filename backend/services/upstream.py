"""What each outside data service answers this server, for /health?upstream=1.

Free services limit or block busy shared IP addresses, which is what cloud hosts use. This shows
which ones still answer us, and why the others refuse.
"""

import asyncio
import re
from services import flood, gdacs, osm, weather
from services.http import get_client

HANOI = {"lat": 21.03, "lon": 105.85}


def _reason(text: str) -> str:
    # Open-Meteo answers {"error":true,"reason":"Hourly API request limit exceeded..."}; others HTML.
    found = re.search(r'"reason"\s*:\s*"([^"]+)"', text)
    text = found.group(1) if found else re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split())[:120]


async def _status(request) -> str:
    try:
        resp = await request()
    except Exception as e:
        return f"{type(e).__name__}: {str(e)[:120]}".rstrip(": ")
    if resp.is_success:
        return "ok"
    return f"{resp.status_code} {_reason(resp.text)}".strip()


async def check_upstream() -> dict:
    point = {"latitude": HANOI["lat"], "longitude": HANOI["lon"]}
    client = get_client()
    checks = {
        "open-meteo forecast": lambda: client.get(weather.FORECAST_URL, params={**point, "current": "temperature_2m"}, timeout=10),
        "open-meteo flood": lambda: client.get(flood.FLOOD_URL, params={**point, "daily": "river_discharge"}, timeout=10),
        "open-meteo geocoding": lambda: client.get(osm.GEOCODING_URL, params={"name": "Hue", "count": 1}, timeout=10),
        "gdacs": lambda: client.get(gdacs.EVENTS_URL, params={"eventlist": "TC", "alertlevel": "Red"}, timeout=20),
        "nominatim": lambda: client.get(osm.NOMINATIM_URL, params={**HANOI, "format": "jsonv2"}, timeout=10),
        "photon": lambda: client.get(osm.PHOTON_URL, params=HANOI, timeout=10),
        **{
            f"overpass {url.split('/')[2]}": (
                lambda url=url: client.post(url, data={"data": "[out:json][timeout:10];node(1);out;"}, timeout=30)
            )
            for url in osm.OVERPASS_URLS
        },
    }
    results = await asyncio.gather(*(_status(request) for request in checks.values()))
    return dict(zip(checks, results))
