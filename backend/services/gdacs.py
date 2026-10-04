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


async def fetch_events() -> list[dict]:
    """Current GDACS events as a list of GeoJSON features (cached for 10 minutes)."""

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
        features = resp.json().get("features", [])
        return [f for f in features if str(f.get("properties", {}).get("iscurrent")).lower() == "true"]

    try:
        return await cache.get_or_set("gdacs:events", 600, load)
    except Exception as e:  # GDACS being down must not break the alerts endpoint
        logger.warning(f"GDACS unavailable: {e}")
        return []
