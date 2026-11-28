import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:locations/privacy.dart';

String repeated(double lon, double lat) => jsonEncode({
      'type': 'FeatureCollection',
      'features': List.generate(
          10,
          (_) => {
                'type': 'Feature',
                'geometry': {
                  'type': 'Point',
                  'coordinates': [lon, lat]
                }
              })
    });
void main() {
  test('enhanced zone suppresses potentially overlapping cells', () {
    final doc = repeated(10.09, 20.09);
    const zone = (lon: 10.01, lat: 20.01, radius: 1.0);
    expect(preview(doc, zone: zone)['receipt']['retained'], 10);
    final r = preview(doc, zone: zone, protectCells: true);
    expect(r['receipt']['excluded'], 0);
    expect(r['receipt']['protectedCellPoints'], 10);
    expect(r['receipt']['retained'], 0);
    expect(r['export']['features'], isEmpty);
  });
  test('antimeridian and accounting', () {
    final r = preview(repeated(179.95, 0.05),
        zone: (lon: -179.99, lat: 0.05, radius: 2.0),
        protectCells: true)['receipt'];
    expect(r['protectedCellPoints'], 10);
    expect(
        r['input'],
        r['excluded'] +
            r['protectedCellPoints'] +
            r['suppressed'] +
            r['retained']);
  });
  test('route audit is opt-in, advisory and excluded from export', () {
    final points = [
      [0, 0, 100.0],
      [1, 0, 101],
      [1, 0, 101],
      [0, 0, null],
      [50, 0, 102]
    ];
    final text = jsonEncode({
      'type': 'FeatureCollection',
      'features': points
          .map((p) => {
                'type': 'Feature',
                'geometry': {
                  'type': 'Point',
                  'coordinates': p.take(2).toList()
                },
                'properties': {'timestamp': p[2]}
              })
          .toList()
    });
    final r = preview(text, auditRoute: true);
    expect(r['routeAudit'], {
      'timedPoints': 4,
      'untimedPoints': 1,
      'nonIncreasingTimestamps': 1,
      'highSpeedSegments': 1
    });
    expect(r['export'].toString(), isNot(contains('timestamp')));
    expect(preview(text).containsKey('routeAudit'), isFalse);
  });
}
