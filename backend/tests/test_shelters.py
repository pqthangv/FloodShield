import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import main
from services import osm
from services.cache import cache

ADMIN = {"X-Admin-Token": "test-admin"}
EN = {"Accept-Language": "en"}
VI = {"Accept-Language": "vi"}
HUE = {"latitude": 16.4637, "longitude": 107.5909}
HUE_QUERY = {"lat": HUE["latitude"], "lon": HUE["longitude"]}
HOSTS = [url.split("/")[2] for url in osm.OVERPASS_URLS]

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


FOUND = {"elements": ELEMENTS}
NOTHING_HERE = {"elements": []}
# What Overpass answers when a query runs out of time: 200, with what it found so far.
TIMED_OUT = {"elements": [], "remark": 'runtime error: Query timed out in "query" at line 3 after 26 seconds.'}
NO_LIST = {"osm3s": {"copyright": "OpenStreetMap"}}


class OverpassResponse:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


def overpass(monkeypatch, *answers):
    """The server's own Overpass calls (GET /shelters) get these answers in order: a JSON body,
    or an exception (no answer, 502...). Returns the servers asked."""
    queue = list(answers)
    asked = []

    class Client:
        async def post(self, url, **kwargs):
            asked.append(url.split("/")[2])
            answer = queue.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return OverpassResponse(answer)

    monkeypatch.setattr(osm, "get_client", lambda: Client())
    return asked


async def names(client, headers=EN):
    r = await client.get("/api/v1/shelters", params=HUE_QUERY, headers=headers)
    assert r.status_code == 200, r.text
    return [s["name"] for s in r.json()["shelters"]]


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
    # The administrator's first, then the nearest OpenStreetMap places; unnamed and far-away ones dropped.
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


@pytest.mark.asyncio
async def test_no_overpass_answer_is_an_error_not_an_empty_list(client, monkeypatch):
    # The app keeps a list it gets for days: "no places here" would stay on screen.
    official = {"name": "Nhà văn hóa phường Vĩnh Ninh", "kind": "shelter", "latitude": 16.4645, "longitude": 107.5912}
    created = await client.post("/api/v1/admin/shelters", json=official, headers=ADMIN)
    try:
        asked = overpass(monkeypatch, *[TimeoutError()] * len(HOSTS))
        r = await client.get("/api/v1/shelters", params=HUE_QUERY, headers=EN)
        assert r.status_code == 503
        assert r.json()["detail"] == "Couldn't find evacuation places right now. Please try again later."
        assert asked == HOSTS  # each server once, and no wider search

        overpass(monkeypatch, *[RuntimeError("502 Bad Gateway")] * len(HOSTS))
        r = await client.get("/api/v1/shelters", params=HUE_QUERY, headers=VI)
        assert r.status_code == 503
        assert r.json()["detail"] == "Chưa tìm được nơi sơ tán lúc này. Vui lòng thử lại sau."

        # Nothing was kept: once Overpass answers, the places come (5 km, then 15 km: only 2 nearby).
        overpass(monkeypatch, FOUND, FOUND)
        assert await names(client) == [
            "Nhà văn hóa phường Vĩnh Ninh", "Bệnh viện Trung ương Huế", "Nguyen Tri Phuong School",
        ]
    finally:
        await client.delete(f"/api/v1/admin/shelters/{created.json()['id']}", headers=ADMIN)


@pytest.mark.asyncio
async def test_an_answer_that_ran_out_of_time_is_not_a_list_of_places(client, monkeypatch):
    asked = overpass(
        monkeypatch,
        TIMED_OUT, NO_LIST, FOUND,  # 5 km: the third server has a real answer
        TIMED_OUT, FOUND,  # 15 km: the second one
    )
    assert await names(client) == ["Bệnh viện Trung ương Huế", "Nguyen Tri Phuong School"]
    assert asked == HOSTS[:3] + HOSTS[:2]


@pytest.mark.asyncio
async def test_when_every_server_runs_out_of_time_the_answer_is_an_error(client, monkeypatch):
    overpass(monkeypatch, *[TIMED_OUT] * len(HOSTS))
    assert (await client.get("/api/v1/shelters", params=HUE_QUERY, headers=EN)).status_code == 503

    # The empty answers weren't kept.
    overpass(monkeypatch, FOUND, FOUND)
    assert await names(client) == ["Bệnh viện Trung ương Huế", "Nguyen Tri Phuong School"]


@pytest.mark.asyncio
async def test_a_failed_wider_search_keeps_the_places_found_nearby(client, monkeypatch):
    overpass(monkeypatch, FOUND, *[TimeoutError()] * len(HOSTS))
    assert await names(client) == ["Bệnh viện Trung ương Huế", "Nguyen Tri Phuong School"]

    # Nothing within 5 km, and 15 km couldn't be searched: that isn't "nothing within 15 km".
    cache.clear()
    overpass(monkeypatch, NOTHING_HERE, *[TimeoutError()] * len(HOSTS))
    assert (await client.get("/api/v1/shelters", params=HUE_QUERY, headers=EN)).status_code == 503


@pytest.mark.asyncio
async def test_a_place_with_nothing_around_gets_an_empty_list(client, monkeypatch):
    asked = overpass(monkeypatch, NOTHING_HERE, NOTHING_HERE)
    assert await names(client) == []
    assert asked == [HOSTS[0], HOSTS[0]]  # 5 km, then 15 km
