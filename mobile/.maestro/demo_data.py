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

WARNING = {
    "vi": {
        "title": "Lũ trên sông Hương",
        "description": "Mực nước sông Hương đang lên nhanh do mưa lớn kéo dài. Người dân vùng trũng thấp "
        "chuẩn bị sơ tán theo hướng dẫn của chính quyền địa phương.",
        "area": "TP. Huế",
        "source": "FloodShield (ví dụ minh họa)",
    },
    "en": {
        "title": "Flooding on the Perfume River",
        "description": "The Perfume River is rising fast after days of heavy rain. People in low-lying "
        "areas should prepare to evacuate as local authorities instruct.",
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
        **WARNING[lang], **HUE, "category": "flood", "severity": "severe", "radius_km": 30,
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
