import httpx
import pytest

from services import osm
from services.cache import cache

# Photon's answer for central Huế (trimmed).
PHOTON_HUE = {
    "features": [
        {
            "properties": {
                "name": "Lý Thường Kiệt", "type": "street", "locality": "Vĩnh Ninh",
                "district": "Thuận Hóa", "city": "Huế", "country": "Việt Nam",
            }
        }
    ]
}


class RefusingNominatim:
    """Nominatim refuses this server (as it can on shared hosting); Photon answers."""

    def __init__(self):
        self.photon_params = None

    async def get(self, url, params=None, timeout=None):
        request = httpx.Request("GET", url)
        if url == osm.NOMINATIM_URL:
            raise httpx.HTTPStatusError("403 Forbidden", request=request, response=httpx.Response(403, request=request))
        self.photon_params = params
        return httpx.Response(200, json=PHOTON_HUE, request=request)


@pytest.mark.asyncio
async def test_place_name_falls_back_to_photon(monkeypatch):
    client = RefusingNominatim()
    monkeypatch.setattr(osm, "get_client", lambda: client)
    cache.clear()

    place = await osm.reverse_geocode(16.4637, 107.5909)
    assert place == {"name": "Vĩnh Ninh", "region": "Huế", "display": "Vĩnh Ninh, Thuận Hóa, Huế"}
    assert "lang" not in client.photon_params  # Vietnamese names are Photon's default

    await osm.reverse_geocode(16.4637, 107.5909, "en")
    assert client.photon_params["lang"] == "en"


class GeocodingSearch:
    """Open-Meteo's place search (trimmed answer for "Cam Ranh")."""

    def __init__(self):
        self.params = None

    async def get(self, url, params=None, timeout=None):
        self.params = params
        answer = {"results": [{"name": "Cam Ranh", "latitude": 11.92144, "longitude": 109.15913,
                               "country_code": "VN", "country": "Việt Nam", "admin1": "Khanh Hoa"}]}
        return httpx.Response(200, json=answer, request=httpx.Request("GET", url))


@pytest.mark.asyncio
async def test_place_search_is_limited_to_vietnam(monkeypatch):
    client = GeocodingSearch()
    monkeypatch.setattr(osm, "get_client", lambda: client)
    cache.clear()

    results = await osm.search_places("Cam Ranh")
    # Only places in Vietnam ("Nha Trang" also matched "Nhà Trắng", the White House, before).
    assert client.params["countryCode"] == "VN"
    assert results == [{"name": "Cam Ranh", "region": "Khanh Hoa", "latitude": 11.92144, "longitude": 109.15913}]
