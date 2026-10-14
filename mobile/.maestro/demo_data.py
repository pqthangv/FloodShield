"""Sample warning and community posts for the App Store screenshots.

They go only to the temporary FloodShield server that GitHub's Mac starts during the iOS build
(.github/workflows/ios.yml), never to the live server: a sample warning there would reach real
people in Huế, and their phones would notify them.

Usage: python3 demo_data.py vi|en   (the warning is written in that language)
"""

import json
import sys
import urllib.parse
import urllib.request

API = "http://localhost:8000/api/v1"
ADMIN = {"X-Admin-Token": "ci-screenshots"}
HUE = {"latitude": 16.4637, "longitude": 107.5909}

# A heavy-rain warning for tonight and tomorrow: the screenshots show the real weather of the
# moment (often sunny), so a warning about rain still to come fits, where an "ongoing flood" did not.
WARNING = {
    "vi": {
        "title": "Cảnh báo mưa rất to",
        "description": "Từ đêm nay đến hết ngày mai có mưa rất to, nhiều nơi trên 120 mm. Đề phòng ngập úng "
        "ở vùng trũng thấp và ven sông suối, hạn chế đi lại khi mưa lớn.",
        "area": "TP. Huế",
        "source": "FloodShield (ví dụ minh họa)",
    },
    "en": {
        "title": "Very heavy rain warning",
        "description": "From tonight until the end of tomorrow, very heavy rain, over 120 mm in places. Watch "
        "for flooding in low-lying areas and near rivers and streams, and avoid travelling in heavy rain.",
        "area": "Hue City",
        "source": "FloodShield (sample)",
    },
}

# People in Vietnam post in Vietnamese, so the posts are the same in both screenshot languages.
POSTS = [
    ("Lan", "device-demo-0001", "knee",
     "Đường Lê Lợi đoạn gần cầu Trường Tiền ngập đến đầu gối, nhiều xe máy chết máy.", 16.4672, 107.5862),
    ("Minh", "device-demo-0002", "ankle",
     "Nước sông dâng nhanh ở Kim Long, bà con đã kê đồ đạc lên cao.", 16.4566, 107.5612),
]


def call(method, path, headers=None, json_body=None, form=None):
    data, all_headers = None, dict(headers or {})
    if json_body is not None:
        data = json.dumps(json_body).encode()
        all_headers["Content-Type"] = "application/json"
    elif form is not None:
        data = urllib.parse.urlencode(form).encode()
        all_headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(API + path, data=data, method=method, headers=all_headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
    return json.loads(body) if body else None


def main(lang):
    # One warning, in this run's language.
    for alert in call("GET", "/admin/alerts", ADMIN):
        call("DELETE", f"/admin/alerts/{alert['id']}", ADMIN)
    call("POST", "/admin/alerts", ADMIN, json_body={
        **WARNING[lang], **HUE, "category": "heavy_rain", "severity": "high", "radius_km": 30,
    })
    # The community posts, once.
    if not call("GET", "/posts")["posts"]:
        for name, device, water, text, lat, lon in POSTS:
            call("POST", "/posts", {"X-Device-Id": device}, form={
                "author_name": name, "description": text, "latitude": lat, "longitude": lon,
                "category": "flood", "water_level": water,
            })
    print(f"sample data ready ({lang})")


if __name__ == "__main__":
    main(sys.argv[1])
