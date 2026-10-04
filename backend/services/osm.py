"""OpenStreetMap lookups: nearby evacuation places (Overpass) and place names (Nominatim)."""

import asyncio
import logging
from typing import Optional
from services.cache import cache
from services.geo import bounding_box, haversine_km, snap
from services.http import get_client

logger = logging.getLogger(__name__)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"

# Places that local authorities in Vietnam commonly use as evacuation points.
KIND_LABELS = {
    "assembly_point": "Điểm tập kết sơ tán",
    "shelter": "Nhà tránh trú",
    "school": "Trường học",
    "university": "Trường đại học",
    "college": "Trường cao đẳng",
    "community_centre": "Nhà văn hóa",
    "townhall": "Trụ sở UBND",
    "hospital": "Bệnh viện",
    "fire_station": "Đội PCCC",
    "police": "Công an",
}

# Nominatim allows at most one request per second.
_nominatim_lock = asyncio.Lock()


def _overpass_query(lat: float, lon: float, radius_km: float) -> str:
    # A bounding box is several times faster on Overpass than an "around" radius filter;
    # the exact distance is computed afterwards.
    south, north, west, east = bounding_box(lat, lon, radius_km)
    return f"""
[out:json][timeout:25][bbox:{south:.4f},{west:.4f},{north:.4f},{east:.4f}];
(
  nwr["emergency"="assembly_point"];
  nwr["social_facility"="shelter"];
  nwr["amenity"="shelter"]["name"]["shelter_type"!="public_transport"];
  nwr["amenity"~"^(school|university|college|community_centre|townhall|hospital|fire_station|police)$"]["name"];
);
out center tags;
"""


def _kind(tags: dict) -> str:
    if tags.get("emergency") == "assembly_point":
        return "assembly_point"
    if tags.get("social_facility") == "shelter":
        return "shelter"
    return tags.get("amenity", "shelter")


def _address(tags: dict) -> Optional[str]:
    parts = [
        " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p),
        tags.get("addr:subdistrict") or tags.get("addr:ward"),
        tags.get("addr:district"),
        tags.get("addr:city") or tags.get("addr:province"),
    ]
    text = ", ".join(p for p in parts if p)
    return text or None


async def find_shelters(lat: float, lon: float, radius_km: float) -> list[dict]:
    lat_s, lon_s = snap(lat, 0.02), snap(lon, 0.02)
    radius_m = int(radius_km * 1000)

    async def load():
        # Query a little wider than asked: the cache key is a snapped point, not the user's.
        query = _overpass_query(lat_s, lon_s, radius_km + 1.5)
        last_error = None
        for url in OVERPASS_URLS:
            try:
                resp = await get_client().post(url, data={"data": query}, timeout=40)
                resp.raise_for_status()
                elements = resp.json().get("elements", [])
                break
            except Exception as e:
                last_error = e
        else:
            raise RuntimeError(f"Overpass unavailable: {last_error}")

        places = []
        for el in elements:
            tags = el.get("tags", {})
            name = tags.get("name:vi") or tags.get("name")
            p_lat = el.get("lat") or el.get("center", {}).get("lat")
            p_lon = el.get("lon") or el.get("center", {}).get("lon")
            if not name or p_lat is None or p_lon is None:
                continue
            kind = _kind(tags)
            places.append(
                {
                    "id": f"osm-{el['type']}-{el['id']}",
                    "name": name,
                    "address": _address(tags),
                    "kind": kind,
                    "kind_label": KIND_LABELS.get(kind, "Nơi trú ẩn"),
                    "latitude": p_lat,
                    "longitude": p_lon,
                    "phone": tags.get("phone") or tags.get("contact:phone"),
                    "capacity": None,
                    "note": None,
                    "official": False,
                    "source": "OpenStreetMap",
                }
            )
        return places

    places = await cache.get_or_set(f"shelters:{lat_s}:{lon_s}:{radius_m}", 7 * 24 * 3600, load)
    result = []
    for p in places:
        distance = haversine_km(lat, lon, p["latitude"], p["longitude"])
        if distance <= radius_km:
            result.append({**p, "distance_km": round(distance, 2)})
    return result


async def reverse_geocode(lat: float, lon: float) -> Optional[dict]:
    """Ward / district / province for a coordinate, in Vietnamese. Best effort."""
    lat_s, lon_s = snap(lat, 0.01), snap(lon, 0.01)

    async def load():
        async with _nominatim_lock:
            resp = await get_client().get(
                NOMINATIM_URL,
                params={
                    "lat": lat_s,
                    "lon": lon_s,
                    "format": "jsonv2",
                    "zoom": 16,
                    "accept-language": "vi",
                },
                timeout=10,
            )
            await asyncio.sleep(1)
        resp.raise_for_status()
        data = resp.json()
        addr = data.get("address", {})
        name = (
            addr.get("suburb")
            or addr.get("quarter")
            or addr.get("village")
            or addr.get("town")
            or addr.get("city_district")
            or addr.get("county")
            or addr.get("city")
            or data.get("name")
        )
        region = addr.get("city") or addr.get("state") or addr.get("province")
        if name == region:
            region = addr.get("state") if name != addr.get("state") else None
        parts = [name, addr.get("city_district") or addr.get("county"), region]
        seen, display = set(), []
        for part in parts:
            if part and part not in seen:
                seen.add(part)
                display.append(part)
        return {"name": name or "Vị trí của bạn", "region": region, "display": ", ".join(display)}

    try:
        return await cache.get_or_set(f"rev:{lat_s}:{lon_s}", 30 * 24 * 3600, load)
    except Exception as e:
        logger.warning(f"Reverse geocoding failed: {e}")
        return None


async def search_places(query: str) -> list[dict]:
    async def load():
        resp = await get_client().get(
            GEOCODING_URL,
            params={"name": query, "count": 10, "language": "vi", "format": "json"},
        )
        resp.raise_for_status()
        results = resp.json().get("results", []) or []
        # Show places in Vietnam first.
        results.sort(key=lambda r: r.get("country_code") != "VN")
        return [
            {
                "name": r.get("name"),
                "region": ", ".join(p for p in (r.get("admin1"), r.get("country")) if p),
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
            }
            for r in results
        ]

    return await cache.get_or_set(f"search:{query.lower().strip()}", 24 * 3600, load)
