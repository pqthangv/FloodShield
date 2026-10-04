import math


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def snap(value: float, step: float) -> float:
    """Round a coordinate to a grid so nearby users share cache entries."""
    return round(round(value / step) * step, 4)


def bounding_box(lat: float, lon: float, radius_km: float):
    d_lat = radius_km / 111.0
    d_lon = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat - d_lat, lat + d_lat, lon - d_lon, lon + d_lon
