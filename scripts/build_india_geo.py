import json
import math
import sys
from pathlib import Path

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/india-states.json")
TARGET = Path(sys.argv[2] if len(sys.argv) > 2 else "client/public/geo/india-states.geojson")
TOLERANCE = float(sys.argv[3]) if len(sys.argv) > 3 else 0.02
NAME_KEYS = ("ST_NM", "NAME_1", "st_nm", "STATE", "name")


def perpendicular_distance(point, start, end):
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    numerator = abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0])
    return numerator / math.hypot(dx, dy)


def douglas_peucker(points, tolerance):
    if len(points) < 3:
        return points
    furthest = 0.0
    index = 0
    for position in range(1, len(points) - 1):
        distance = perpendicular_distance(points[position], points[0], points[-1])
        if distance > furthest:
            furthest = distance
            index = position
    if furthest <= tolerance:
        return [points[0], points[-1]]
    left = douglas_peucker(points[: index + 1], tolerance)
    right = douglas_peucker(points[index:], tolerance)
    return left[:-1] + right


def ring_area(points):
    total = 0.0
    for index in range(len(points) - 1):
        total += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1]
    return abs(total) / 2


def simplify_ring(ring, tolerance):
    rounded = [[round(float(x), 3), round(float(y), 3)] for x, y in ring]
    simplified = douglas_peucker(rounded, tolerance)
    if len(simplified) < 4:
        return None
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    if ring_area(simplified) < 0.01:
        return None
    return simplified


def state_name(properties):
    for key in NAME_KEYS:
        value = properties.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "Unnamed region"


def main():
    raw = json.loads(SOURCE.read_text())
    features = []
    for feature in raw.get("features", []):
        geometry = feature.get("geometry") or {}
        kind = geometry.get("type")
        coordinates = geometry.get("coordinates")
        if not coordinates:
            continue
        if kind == "Polygon":
            polygons = [coordinates]
        elif kind == "MultiPolygon":
            polygons = coordinates
        else:
            continue
        rings = []
        for polygon in polygons:
            outer = simplify_ring(polygon[0], TOLERANCE)
            if not outer:
                continue
            rings.append([outer])
        if not rings:
            continue
        output = rings[0] if len(rings) == 1 else rings
        features.append(
            {
                "type": "Feature",
                "properties": {"name": state_name(feature.get("properties") or {})},
                "geometry": {"type": "Polygon" if len(rings) == 1 else "MultiPolygon", "coordinates": output},
            }
        )
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "name": "india-states",
                "attribution": "State boundaries derived from DataMeet India boundary data (CC BY 2.5 IN)",
                "features": features,
            },
            separators=(",", ":"),
        )
    )
    size = TARGET.stat().st_size
    print(f"features={len(features)} size_kb={size / 1024:.1f} tolerance={TOLERANCE}")


if __name__ == "__main__":
    main()
