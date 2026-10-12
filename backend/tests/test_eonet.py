from datetime import datetime, timedelta, timezone

import httpx
import pytest

from services import alerts, eonet, gdacs
from services.cache import cache

HUE = (16.46, 107.59)
NOW = datetime(2026, 10, 11, 19, 0, tzinfo=timezone.utc)


def iso(when: datetime) -> str:
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def storm(title="Typhoon Koguma", lon=111.3, lat=16.5, kts=100.0, hours_ago=7, sources=("JTWC",), event_id="EONET_1"):
    """An EONET storm whose last position (`lon`, `lat`) is `hours_ago` old; 400 km east of Hue by default."""
    last = NOW - timedelta(hours=hours_ago)
    return {
        "id": event_id,
        "title": title,
        "closed": None,
        "sources": [{"id": s, "url": f"https://example.org/{s}"} for s in sources],
        "geometry": [  # newest first, to check the order isn't trusted
            {"date": iso(last), "type": "Point", "coordinates": [lon, lat],
             "magnitudeValue": kts, "magnitudeUnit": "kts" if kts is not None else None},
            {"date": iso(last - timedelta(days=1)), "type": "Point", "coordinates": [lon + 3, lat - 1],
             "magnitudeValue": 60.0, "magnitudeUnit": "kts"},
        ],
    }


def gdacs_storm(name="KOGUMA-26", lon=147.4, lat=26.2, current=True, todate="2026-10-11T15:00:00"):
    return {
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"eventtype": "TC", "eventid": 9, "eventname": name, "alertlevel": "Green",
                       "iscurrent": "true" if current else "false", "todate": todate},
    }


def run(storms, gdacs_events=(), lang="vi", where=HUE):
    return alerts.eonet_alerts(list(storms), list(gdacs_events), *where, lang, now=NOW)


def test_typhoon_near_vietnam_becomes_an_alert():
    [alert] = run([storm()])
    assert alert["id"] == "eonet-EONET_1-severe"
    assert alert["category"] == "storm" and alert["disaster_type_id"] == alerts.TYPE_STORM
    assert alert["title"] == "Bão Koguma"
    assert alert["source"] == "NASA EONET (JTWC)"
    assert alert["url"] is None  # JTWC's link is a raw data file
    assert 380 < alert["distance_km"] < 420
    # Times in Vietnam's clock, like the forecast: 12:00 UTC is 19:00.
    assert alert["starts_at"] == "2026-10-10T19:00"
    assert alert["details"][1] == {"label": "Gió mạnh nhất gần tâm", "value": "185 km/h (cấp 16)"}
    assert alert["details"][2] == {"label": "Vị trí lúc", "value": "19:00 Chủ nhật, 11/10"}


def test_ended_storms_left_open_by_eonet_are_ignored():
    # EONET still listed Tropical Storm Hanna as open 11 days after its last position.
    assert run([storm(hours_ago=268)]) == []
    assert len(run([storm(hours_ago=23)])) == 1


def test_severity_from_distance_and_wind():
    def severity(kts, lon):
        found = run([storm(kts=kts, lon=lon, lat=HUE[0])])
        return found[0]["severity"] if found else None

    assert severity(100, 111.3) == "severe"  # typhoon about 400 km away
    assert severity(50, 111.3) == "high"  # tropical storm
    assert severity(30, 113.2) == "moderate"  # tropical depression 600 km away
    assert severity(30, 116.0) is None  # ... 900 km away
    assert severity(100, 117.0) == "moderate"  # typhoon 1,000 km away
    assert severity(100, 123.0) is None  # ... 1,640 km away


def test_depressions_are_not_called_typhoons():
    [alert] = run([storm(title="Tropical Depression 25W", kts=30)])
    assert alert["title"] == "Áp thấp nhiệt đới 25W"
    assert run([storm(title="Tropical Depression 25W", kts=30)], lang="en")[0]["title"] == "Tropical depression 25W"


def test_unknown_wind_uses_the_last_known_one_or_counts_as_a_tropical_storm():
    [alert] = run([storm(kts=None)])  # last position without wind: the one before had 60 knots
    assert alert["severity"] == "high"
    assert alert["details"][1]["value"] == "111 km/h (cấp 11)"

    no_wind = storm()
    for g in no_wind["geometry"]:
        g["magnitudeValue"] = g["magnitudeUnit"] = None
    [alert] = run([no_wind])
    assert alert["severity"] == "high" and alert["title"] == "Bão Koguma"
    assert [d["label"] for d in alert["details"]] == ["Khoảng cách", "Vị trí lúc"]


def test_storms_gdacs_reports_are_shown_once():
    # Same name ("Typhoon Koguma" and "KOGUMA-26"): GDACS's alert is shown instead.
    assert run([storm()], [gdacs_storm()]) == []
    # Numbered storms have different names ("15W", "FIFTEEN-26"): the same place tells.
    assert run([storm(title="Tropical Storm 15W")], [gdacs_storm("FIFTEEN-26", lon=112.0, lat=16.0)]) == []
    # Another storm far away doesn't hide this one.
    assert len(run([storm()], [gdacs_storm("SIMON-26", lon=-105.3, lat=19.2)])) == 1
    # Not a storm.
    flood = {"geometry": {"coordinates": [111.3, 16.5]}, "properties": {"eventtype": "FL", "iscurrent": "true"}}
    assert len(run([storm()], [flood])) == 1


def test_storm_gdacs_closed_long_ago_is_still_shown():
    # GDACS closed NOLO-26 on 4 Oct, JTWC still tracked "Hurricane Nolo" on 10 Oct: GDACS lost it.
    lost = gdacs_storm("NOLO-26", lon=180.0, lat=24.2, current=False, todate="2026-10-05T12:00:00")
    assert len(run([storm(title="Hurricane Nolo")], [lost])) == 1
    # Closed by GDACS when EONET's track ends: the storm is over.
    over = gdacs_storm("NOLO-26", current=False, todate="2026-10-11T09:00:00")
    assert run([storm(title="Hurricane Nolo")], [over]) == []
    # GDACS's date can't be read: rather show the storm than hide it.
    unreadable = gdacs_storm("NOLO-26", current=False, todate="?")
    assert len(run([storm(title="Hurricane Nolo")], [unreadable])) == 1


def test_only_storm_tracks_from_the_typhoon_agencies():
    assert run([storm(sources=("EO",))]) == []
    [alert] = run([storm(sources=("EO", "JTWC", "NOAA_NHC"))])
    assert alert["source"] == "NASA EONET (JTWC, NOAA NHC)"
    assert alert["url"] == "https://example.org/EO"  # a NASA article people can read


def test_eonet_alerts_in_english():
    vi = run([storm()])[0]
    en = run([storm()], lang="en")[0]
    assert en["id"] == vi["id"]
    assert en["title"] == "Tropical cyclone Koguma"
    assert en["details"][2] == {"label": "Position at", "value": "19:00 Sun 11 Oct"}


def test_unusable_positions_are_skipped():
    broken = storm()
    broken["geometry"] = [
        {"date": "not a date", "type": "Point", "coordinates": [111.3, 16.5]},
        {"date": iso(NOW), "type": "Point", "coordinates": []},
        {"date": iso(NOW), "type": "Polygon", "coordinates": [[[111, 16], [112, 16], [112, 17]]]},
        "?",
    ]
    assert run([broken]) == []
    assert run([{**storm(), "id": None}]) == []


def test_gdacs_times_use_the_local_clock():
    event = {
        "geometry": {"coordinates": [111.3, 16.5]},
        "properties": {"eventtype": "TC", "eventid": 1, "alertlevel": "Orange", "eventname": "YAGI-26",
                       "fromdate": "2026-10-05T00:00:00", "todate": "2026-10-07T18:00:00"},
    }
    [alert] = alerts.gdacs_alerts([event], *HUE)
    assert (alert["starts_at"], alert["ends_at"]) == ("2026-10-05T07:00", "2026-10-08T01:00")


class Down:
    def __init__(self):
        self.calls = 0

    async def get(self, *args, **kwargs):
        self.calls += 1
        raise httpx.ConnectTimeout("timed out")


@pytest.mark.asyncio
@pytest.mark.parametrize("module, fetch", [(eonet, "fetch_storms"), (gdacs, "fetch_events")])
async def test_a_source_that_is_down_is_not_asked_at_every_alert_check(monkeypatch, module, fetch):
    down = Down()
    monkeypatch.setattr(module, "get_client", lambda: down)
    cache.clear()
    assert await getattr(module, fetch)() == []
    assert await getattr(module, fetch)() == []
    assert down.calls == 1
    cache.clear()
