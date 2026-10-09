"""OpenStreetMap lookups: nearby evacuation places (Overpass) and place names (Nominatim,
with Photon as a backup)."""

import asyncio
import logging
from typing import Optional
from i18n import MESSAGES, Lang, t
from services.cache import cache
from services.geo import bounding_box, haversine_km, snap
from services.http import get_client

logger = logging.getLogger(__name__)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    # The two servers behind the main address, for when it sends us to the busy one.
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    # A separate server (VK), often slow.
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
PHOTON_URL = "https://photon.komoot.io/reverse"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"


def kind_label(kind: str, lang: Lang, fallback: str = "kind_other") -> str:
    """Label for a kind of evacuation place (school, ward office...), see i18n.py."""
    key = f"kind_{kind}"
    return t(lang, key if key in MESSAGES else fallback)


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


def parse_places(elements: list[dict]) -> list[dict]:
    """Overpass elements -> evacuation places (unsorted, for any distance)."""
    places = []
    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name:vi") or tags.get("name")
        center = el.get("center") or {}
        p_lat = el.get("lat") if el.get("lat") is not None else center.get("lat")
        p_lon = el.get("lon") if el.get("lon") is not None else center.get("lon")
        if not name or p_lat is None or p_lon is None:
            continue
        places.append(
            {
                "id": f"osm-{el['type']}-{el['id']}",
                "name": name,
                "name_en": tags.get("name:en"),
                "address": _address(tags),
                "kind": _kind(tags),
                "latitude": float(p_lat),
                "longitude": float(p_lon),
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "capacity": None,
                "note": None,
                "official": False,
                "source": "OpenStreetMap",
            }
        )
    return places


async def find_shelters(
    lat: float, lon: float, radius_km: float, lang: Lang = "vi", elements: Optional[list[dict]] = None
) -> list[dict]:
    """Evacuation places from OpenStreetMap: schools, community centres, ward offices...
    (the kinds local authorities in Vietnam commonly use).

    `elements`: Overpass results the app downloaded itself (only used for this answer, never
    cached); otherwise this server queries Overpass.
    """
    if elements is not None:
        return nearby_places(parse_places(elements), lat, lon, radius_km, lang)

    lat_s, lon_s = snap(lat, 0.02), snap(lon, 0.02)
    radius_m = int(radius_km * 1000)

    async def load():
        # Query a little wider than asked: the cache key is a snapped point, not the user's.
        query = _overpass_query(lat_s, lon_s, radius_km + 1.5)
        last_error = None
        for url in OVERPASS_URLS:
            try:
                resp = await get_client().post(url, data={"data": query}, timeout=25)
                resp.raise_for_status()
                return parse_places(resp.json().get("elements", []))
            except Exception as e:
                logger.warning(f"Overpass {url.split('/')[2]} failed: {e}")
                last_error = e
        raise RuntimeError(f"Overpass unavailable: {last_error}")

    places = await cache.get_or_set(f"shelters:{lat_s}:{lon_s}:{radius_m}", 7 * 24 * 3600, load)
    return nearby_places(places, lat, lon, radius_km, lang)


def nearby_places(places: list[dict], lat: float, lon: float, radius_km: float, lang: Lang) -> list[dict]:
    result = []
    for p in places:
        distance = haversine_km(lat, lon, p["latitude"], p["longitude"])
        if distance <= radius_km:
            place = {k: v for k, v in p.items() if k != "name_en"}
            if lang == "en" and p.get("name_en"):
                place["name"] = p["name_en"]
            place["kind_label"] = kind_label(p["kind"], lang)
            place["distance_km"] = round(distance, 2)
            result.append(place)
    return result


async def reverse_geocode(lat: float, lon: float, lang: Lang = "vi") -> Optional[dict]:
    """Ward / district / province for a coordinate. Best effort. Most places in Vietnam have no
    English name in OpenStreetMap, so names usually stay Vietnamese in English too."""
    lat_s, lon_s = snap(lat, 0.01), snap(lon, 0.01)

    async def load():
        try:
            return await _nominatim_place(lat_s, lon_s, lang)
        except Exception as e:
            # Nominatim can refuse servers that share an IP address with many other apps.
            logger.warning(f"Nominatim failed, trying Photon: {e}")
        return await _photon_place(lat_s, lon_s, lang)

    try:
        return await cache.get_or_set(f"rev:{lang}:{lat_s}:{lon_s}", 30 * 24 * 3600, load)
    except Exception as e:
        logger.warning(f"Reverse geocoding failed: {e}")
        return None


def _place(name: Optional[str], district: Optional[str], region: Optional[str], lang: Lang) -> dict:
    seen, display = set(), []
    for part in (name, district, region):
        if part and part not in seen:
            seen.add(part)
            display.append(part)
    return {"name": name or t(lang, "your_location"), "region": region, "display": ", ".join(display)}


async def _nominatim_place(lat: float, lon: float, lang: Lang) -> dict:
    async with _nominatim_lock:
        resp = await get_client().get(
            NOMINATIM_URL,
            params={"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 16, "accept-language": lang},
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
    return _place(name, addr.get("city_district") or addr.get("county"), region, lang)


async def _photon_place(lat: float, lon: float, lang: Lang) -> dict:
    # Photon (komoot) searches the same OpenStreetMap data. Without `lang` it returns local
    # (Vietnamese) names; it has no "vi" option.
    params = {"lat": lat, "lon": lon, **({"lang": "en"} if lang == "en" else {})}
    resp = await get_client().get(PHOTON_URL, params=params, timeout=10)
    resp.raise_for_status()
    features = resp.json().get("features") or []
    if not features:
        raise RuntimeError("Photon found no place")
    props = features[0].get("properties", {})
    name = props.get("locality") or props.get("district") or props.get("city")
    region = props.get("city") or props.get("state")
    if name == region:
        region = props.get("state") if name != props.get("state") else None
    return _place(name, props.get("district"), region, lang)


async def search_places(query: str, lang: Lang = "vi") -> list[dict]:
    async def load():
        resp = await get_client().get(
            GEOCODING_URL,
            params={"name": query, "count": 10, "language": lang, "format": "json"},
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

    return await cache.get_or_set(f"search:{lang}:{query.lower().strip()}", 24 * 3600, load)
