from services import alerts, flood


def forecast(rain=(0, 0, 0), gusts=(20, 20, 20), tmax=(30, 30, 30), elevation=5, hourly_rain=None):
    days = ["2026-10-04", "2026-10-05", "2026-10-06"]
    hours = [f"2026-10-04T{h:02d}:00" for h in range(24)] + [f"2026-10-05T{h:02d}:00" for h in range(24)]
    return {
        "elevation": elevation,
        "current": {"time": "2026-10-04T00:00"},
        "daily": {
            "time": days,
            "precipitation_sum": list(rain),
            "wind_speed_10m_max": [g * 0.6 for g in gusts],
            "wind_gusts_10m_max": list(gusts),
            "temperature_2m_max": list(tmax),
        },
        "hourly": {"time": hours, "precipitation": hourly_rain or [0] * len(hours)},
    }


def test_beaufort_levels():
    assert alerts.beaufort(30) == 5
    assert alerts.beaufort(62) == 8
    assert alerts.beaufort(118) == 12
    assert alerts.beaufort(None) == 0


def test_no_alerts_in_calm_weather():
    raw = forecast()
    assert alerts.rain_alerts(raw, "X") == []
    assert alerts.wind_alert(raw, "X") is None
    assert alerts.heat_alert(raw, "X") is None
    assert alerts.intense_rain_alert(raw, "X") is None


def test_heavy_rain_thresholds():
    assert alerts.rain_alerts(forecast(rain=(60, 0, 0)), "X")[0]["severity"] == "moderate"
    high = alerts.rain_alerts(forecast(rain=(10, 120, 0)), "X")[0]
    assert high["severity"] == "high"
    assert high["id"] == "rain-2026-10-05-high"
    assert high["disaster_type_id"] == alerts.TYPE_FLOOD
    assert alerts.rain_alerts(forecast(rain=(250, 0, 0)), "X")[0]["severity"] == "severe"


def test_landslide_only_in_hilly_terrain():
    lowland = alerts.rain_alerts(forecast(rain=(120, 60, 0), elevation=5), "X")
    hills = alerts.rain_alerts(forecast(rain=(120, 60, 0), elevation=600), "X")
    assert [a["category"] for a in lowland] == ["heavy_rain"]
    assert [a["category"] for a in hills] == ["heavy_rain", "landslide"]


def test_intense_rain_triggers_urban_flood_alert():
    hourly = [0] * 48
    hourly[5:8] = [30, 25, 20]
    alert = alerts.intense_rain_alert(forecast(hourly_rain=hourly), "X")
    assert alert["category"] == "urban_flood"
    assert alert["severity"] == "moderate"


def test_wind_and_heat():
    wind = alerts.wind_alert(forecast(gusts=(40, 95, 30)), "X")
    assert wind["severity"] == "high" and "giật cấp 10" in wind["title"]
    heat = alerts.heat_alert(forecast(tmax=(36, 38, 34)), "X")
    assert heat["severity"] == "moderate"


def test_gdacs_filters_by_distance_and_country():
    hue = (16.46, 107.59)
    events = [
        {  # typhoon 400 km east of Hue -> included
            "geometry": {"coordinates": [111.3, 16.5]},
            "properties": {"eventtype": "TC", "eventid": 1, "alertlevel": "Orange", "eventname": "YAGI-26"},
        },
        {  # earthquake in Japan -> ignored
            "geometry": {"coordinates": [130.6, 29.2]},
            "properties": {"eventtype": "EQ", "eventid": 2, "alertlevel": "Green",
                           "severitydata": {"severity": 4.8}},
        },
        {  # flood somewhere in Vietnam -> included even if far
            "geometry": {"coordinates": [105.8, 21.0]},
            "properties": {"eventtype": "FL", "eventid": 3, "alertlevel": "Green",
                           "affectedcountries": [{"iso3": "VNM"}], "country": "Viet Nam"},
        },
    ]
    result = alerts.gdacs_alerts(events, *hue)
    assert [a["category"] for a in result] == ["storm", "flood"]
    assert result[0]["severity"] == "high"
    assert result[0]["title"] == "Bão YAGI-26"
    assert result[1]["title"] == "Lũ lụt tại Việt Nam"


def test_gumbel_thresholds_are_ordered():
    maxima = [100 + 10 * (i % 7) + i for i in range(20)]
    thr = flood.gumbel_thresholds(maxima)
    assert thr["rp2"] < thr["rp5"] < thr["rp20"]
    assert flood.gumbel_thresholds([5.0] * 3) is None


def test_annual_maxima_skips_incomplete_years():
    times = [f"2020-{m:02d}-{d:02d}" for m in range(1, 13) for d in range(1, 29)]  # 336 days
    times += ["2021-01-01", "2021-01-02"]
    values = list(range(len(times)))
    assert flood.annual_maxima(times, values) == [335]


def test_flood_classification():
    thr = {"rp2": 100, "rp5": 150, "rp20": 200}
    assert flood.classify(90, 95, thr) == "none"
    assert flood.classify(90, 120, thr) == "watch"
    assert flood.classify(110, 120, thr) == "moderate"
    assert flood.classify(160, 200, thr) == "high"
    assert flood.classify(210, 250, thr) == "severe"
    assert flood.classify(210, 250, None) == "unknown"
