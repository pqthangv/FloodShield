"""Active disaster events from GDACS (Global Disaster Alert and Coordination System).

GDACS is run by the UN and the European Commission and covers tropical cyclones (bão),
floods, earthquakes, droughts, wildfires and volcanoes worldwide. https://www.gdacs.org
"""

import logging
from datetime import datetime, timedelta, timezone
from services.cache import cache
from services.http import get_client

logger = logging.getLogger(__name__)

EVENTS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
CACHE_KEY = "gdacs:events"


def is_current(feature: dict) -> bool:
    return str(feature.get("properties", {}).get("iscurrent")).lower() == "true"


async def fetch_events() -> list[dict]:
    """GDACS events of the last 3 weeks as GeoJSON features (cached for 10 minutes).

    Ended events are included: only current ones become alerts, but the ended storms tell
    which NASA EONET storms GDACS has already closed (see alerts.eonet_alerts)."""

    async def load():
        now = datetime.now(timezone.utc)
        resp = await get_client().get(
            EVENTS_URL,
            params={
                "eventlist": "TC;FL;EQ;DR;WF;VO",
                "alertlevel": "Green;Orange;Red",
                "fromDate": (now - timedelta(days=21)).strftime("%Y-%m-%d"),
                "toDate": (now + timedelta(days=1)).strftime("%Y-%m-%d"),
            },
        )
        resp.raise_for_status()
        return resp.json().get("features", [])

    try:
        return await cache.get_or_set(CACHE_KEY, 600, load)
    except Exception as e:  # GDACS being down must not break the alerts endpoint
        logger.warning(f"GDACS unavailable: {e}")
        # Nor slow it down: without this, every alert check would wait for GDACS to time out.
        cache.set(CACHE_KEY, [], 120)
        return []
