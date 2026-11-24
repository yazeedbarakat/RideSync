from math import asin, cos, radians, sin, sqrt


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * asin(sqrt(a))


def timed_path(path: list, start: float, end: float) -> list:
    """[[minute, lat, lon], ...]: a polyline driven at constant speed from start to end."""
    dist = [0.0]
    for a, b in zip(path, path[1:]):
        dist.append(dist[-1] + haversine_m(*a, *b))
    total = dist[-1] or 1.0
    return [[round(start + (end - start) * d / total, 3), p[0], p[1]] for d, p in zip(dist, path)]


def position_at(track: list, minute: float) -> list:
    """Interpolated [lat, lon] on a timed path (static/app.js mirrors this)."""
    if minute <= track[0][0]:
        return track[0][1:]
    for a, b in zip(track, track[1:]):
        if minute <= b[0]:
            t = (minute - a[0]) / ((b[0] - a[0]) or 1.0)
            return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    return track[-1][1:]
