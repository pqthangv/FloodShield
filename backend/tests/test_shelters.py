import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import main
from services import osm
from services.cache import cache

ADMIN = {"X-Admin-Token": "test-admin"}
EN = {"Accept-Language": "en"}
HUE = {"latitude": 16.4637, "longitude": 107.5909}

# What the app sends: Overpass elements, trimmed to the tags the server reads.
ELEMENTS = [
    {"type": "node", "id": 1, "lat": 16.4700, "lon": 107.5950,
     "tags": {"amenity": "school", "name": "Trường THCS Nguyễn Tri Phương", "name:en": "Nguyen Tri Phuong School",
              "addr:street": "Lý Thường Kiệt", "addr:city": "Huế"}},
    {"type": "way", "id": 2, "center": {"lat": 16.4640, "lon": 107.5920},
     "tags": {"amenity": "hospital", "name": "Bệnh viện Trung ương Huế", "phone": "0234 3822 325"}},
    {"type": "node", "id": 3, "lat": 16.4650, "lon": 107.5930, "tags": {"amenity": "school"}},  # no name
    {"type": "node", "id": 4, "lat": 16.7000, "lon": 107.9000,  # ~40 km away
     "tags": {"amenity": "townhall", "name": "UBND xã Xa"}},
]


@pytest_asyncio.fixture
async def client(monkeypatch):
    async def overpass_refuses(*args, **kwargs):
        raise AssertionError("the server must not query Overpass when the app sends the data")

    cache.clear()
    await main.init_db()
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as c:
        monkeypatch.setattr(osm, "get_client", overpass_refuses)
        yield c


@pytest.mark.asyncio
async def test_shelters_from_places_the_app_downloaded(client):
    official = {"name": "Nhà văn hóa phường Vĩnh Ninh", "kind": "shelter", "latitude": 16.4645, "longitude": 107.5912}
    created = await client.post("/api/v1/admin/shelters", json=official, headers=ADMIN)

    r = await client.post("/api/v1/shelters", json={**HUE, "radius_km": 5, "elements": ELEMENTS}, headers=EN)
    assert r.status_code == 200, r.text
    shelters = r.json()["shelters"]
    # Official first, then the nearest OpenStreetMap places; unnamed and far-away ones dropped.
    assert [s["name"] for s in shelters] == [
        "Nhà văn hóa phường Vĩnh Ninh", "Bệnh viện Trung ương Huế", "Nguyen Tri Phuong School",
    ]
    hospital = shelters[1]
    assert hospital["kind_label"] == "Hospital" and hospital["phone"] == "0234 3822 325"
    assert hospital["distance_km"] < shelters[2]["distance_km"]
    assert shelters[2]["address"] == "Lý Thường Kiệt, Huế"

    await client.delete(f"/api/v1/admin/shelters/{created.json()['id']}", headers=ADMIN)


@pytest.mark.asyncio
async def test_bad_places_from_the_app_are_rejected(client):
    no_id = [{"type": "node", "lat": 16.47, "lon": 107.59, "tags": {"name": "X"}}]
    bad_coordinate = [{"type": "node", "id": 9, "lat": "north", "lon": 107.59, "tags": {"name": "X"}}]
    for elements in (no_id, bad_coordinate):
        r = await client.post("/api/v1/shelters", json={**HUE, "elements": elements}, headers=EN)
        assert r.status_code == 422 and r.json()["detail"] == "Invalid place data"
    too_many = [ELEMENTS[0]] * 5001
    assert (await client.post("/api/v1/shelters", json={**HUE, "elements": too_many})).status_code == 422
