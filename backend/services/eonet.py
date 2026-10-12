"""Tropical storm tracks from NASA EONET (Earth Observatory Natural Event Tracker).

EONET collects natural events from many agencies. Its floods and wildfires around Vietnam are
copies of GDACS events, so only the storms are used: positions and wind speeds from the Joint
Typhoon Warning Center (JTWC) and the US National Hurricane Center. They back up GDACS for a
storm it hasn't listed yet, and for every storm while GDACS is down (see alerts.eonet_alerts).
https://eonet.gsfc.nasa.gov
"""

import logging
from services.cache import cache
from services.http import get_client

logger = logging.getLogger(__name__)

EVENTS_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"
CACHE_KEY = "eonet:storms"


async def fetch_storms() -> list[dict]:
    """Open storms with a position in the last 3 days (cached for 10 minutes).

    `days` is needed: without it EONET returns every event never closed, mostly wildfires (5 MB,
    30 s). Ended storms still stay open for weeks, so the alerts check the last position's date."""

    async def load():
        resp = await get_client().get(
            EVENTS_URL,
            params={"status": "open", "category": "severeStorms", "days": 3},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("events", [])

    try:
        return await cache.get_or_set(CACHE_KEY, 600, load)
    except Exception as e:  # EONET being down must not break or slow down the alerts endpoint
        logger.warning(f"NASA EONET unavailable: {e}")
        cache.set(CACHE_KEY, [], 120)
        return []
