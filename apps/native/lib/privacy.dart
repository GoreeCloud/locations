import 'dart:convert';
import 'dart:math' as math;

const limit = 100000;
bool valid(num lon, num lat) =>
    lon.isFinite && lat.isFinite && lon.abs() <= 180 && lat.abs() <= 90;
double distanceKm(num a, num b, num c, num d) {
  double rad(num v) => v * math.pi / 180;
  final h = math.pow(math.sin(rad(d - b) / 2), 2) +
      math.cos(rad(b)) *
          math.cos(rad(d)) *
          math.pow(math.sin(rad(c - a) / 2), 2);
  return 12742 * math.asin(math.sqrt(h.clamp(0, 1)));
}

Map<String, dynamic> preview(String input,
    {double grid = .1,
    int minimum = 10,
    bool protectCells = false,
    bool auditRoute = false,
    ({double lon, double lat, double radius})? zone}) {
  if (input.length > 8 * 1024 * 1024 ||
      !grid.isFinite ||
      grid < .1 ||
      grid > 10 ||
      minimum < 5 ||
      minimum > limit ||
      (zone != null &&
          (!valid(zone.lon, zone.lat) ||
              !zone.radius.isFinite ||
              zone.radius <= 0 ||
              zone.radius > 1000))) {
    throw const FormatException('Invalid input or privacy settings');
  }
  final doc = jsonDecode(input);
  if (doc is! Map ||
      doc['type'] != 'FeatureCollection' ||
      doc['features'] is! List ||
      doc['features'].length > limit) {
    throw const FormatException('Expected bounded Point FeatureCollection');
  }
  final points = doc['features'] as List;
  final counts = <(int, int), int>{};
  final unique = <(num, num)>{};
  var excluded = 0;
  var timedPoints = 0,
      untimedPoints = 0,
      nonIncreasingTimestamps = 0,
      highSpeedSegments = 0;
  ({num lon, num lat, int t})? previous;
  for (final f in points) {
    if (f is! Map ||
        f['type'] != 'Feature' ||
        f['geometry'] is! Map ||
        f['geometry']['type'] != 'Point') {
      throw const FormatException('Invalid point');
    }
    final p = f['geometry']['coordinates'];
    if (p is! List ||
        p.length < 2 ||
        p.length > 3 ||
        !p.every((v) => v is num && v.isFinite) ||
        !valid(p[0], p[1])) {
      throw const FormatException('Invalid coordinates');
    }
    final lon = p[0] as num, lat = p[1] as num;
    if (auditRoute) {
      final props = f['properties'];
      final t = props is Map ? props['timestamp'] : null;
      if (t is! num ||
          !t.isFinite ||
          t < 0 ||
          t > 4102444800 ||
          t != t.truncate()) {
        untimedPoints++;
        previous = null;
      } else {
        timedPoints++;
        final last = previous;
        if (last != null) {
          final dt = t - last.t;
          if (dt <= 0) {
            nonIncreasingTimestamps++;
          } else if (distanceKm(last.lon, last.lat, lon, lat) * 3600 / dt >
              350) {
            highSpeedSegments++;
          }
        }
        previous = (lon: lon, lat: lat, t: t.toInt());
      }
    }
    if (zone != null &&
        distanceKm(lon, lat, zone.lon, zone.lat) <= zone.radius) {
      excluded++;
      continue;
    }
    unique.add((lon, lat));
    final x = math.min(((lon + 180) / grid).floor(), (360 / grid).ceil() - 1);
    final y = math.min(((lat + 90) / grid).floor(), (180 / grid).ceil() - 1);
    counts.update((x, y), (v) => v + 1, ifAbsent: () => 1);
  }
  var suppressed = 0, retained = 0, protectedCellPoints = 0;
  final features = <Map<String, dynamic>>[];
  double round(num n) => double.parse(n.toStringAsFixed(8));
  for (final entry in counts.entries) {
    final count = entry.value;
    final w = round(-180 + entry.key.$1 * grid),
        s = round(-90 + entry.key.$2 * grid);
    final e = math.min(180, round(w + grid)), n = math.min(90, round(s + grid));
    if (zone != null &&
        protectCells &&
        distanceKm((w + e) / 2, (s + n) / 2, zone.lon, zone.lat) <=
            zone.radius +
                6371 * math.pi / 180 * ((e - w + n - s) / 2) +
                0.00001) {
      protectedCellPoints += count;
      continue;
    }
    if (count < minimum) {
      suppressed += count;
      continue;
    }
    features.add({
      'type': 'Feature',
      'geometry': {
        'type': 'Polygon',
        'coordinates': [
          [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s]
          ]
        ]
      },
      'properties': {'point_count': count}
    });
    retained += count;
  }
  return {
    'receipt': {
      'input': points.length,
      'excluded': excluded,
      'suppressed': suppressed,
      'retained': retained,
      'cells': features.length,
      'repeatCoordinates': points.length - excluded - unique.length,
      if (protectCells) 'protectedCellPoints': protectedCellPoints
    },
    if (auditRoute)
      'routeAudit': {
        'timedPoints': timedPoints,
        'untimedPoints': untimedPoints,
        'nonIncreasingTimestamps': nonIncreasingTimestamps,
        'highSpeedSegments': highSpeedSegments
      },
    'export': {'type': 'FeatureCollection', 'features': features}
  };
}

String sample() => jsonEncode({
      'type': 'FeatureCollection',
      'features': List.generate(
          22,
          (i) => {
                'type': 'Feature',
                'geometry': {
                  'type': 'Point',
                  'coordinates': i < 12
                      ? [10.01, 20.01]
                      : i < 20
                          ? [11.01, 21.01]
                          : [30, 40]
                },
                'properties': {'synthetic': true}
              })
    });
