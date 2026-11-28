import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:locations/history.dart';
import 'package:locations/privacy.dart';

void main() {
  test('portable CSV coordinates and optional seconds', () {
    const raw =
        'longitude,latitude,timestamp\r\n10,20,100\r\n11,20,101\r\n12,20,';
    final out = jsonDecode(normalizeHistory(raw));
    expect(out['features'].length, 3);
    expect(out['features'][0]['geometry']['coordinates'], [10, 20]);
    expect(out['features'][0]['properties']['timestamp'], 100);
    expect(out['features'][2]['properties'], isEmpty);
    expect(
        preview(normalizeHistory(raw), auditRoute: true)['routeAudit']
            ['highSpeedSegments'],
        1);
  });
  test('reject ambiguous headers, units, coordinates and extra fields', () {
    for (final raw in [
      'lat,lon\n20,10',
      'longitude,latitude\n181,0',
      'longitude,latitude,timestamp\n10,20,1700000000000',
      'longitude,latitude\n1,2,3',
      'longitude,latitude\n"1",2',
      'longitude,latitude\n,2',
      'longitude,latitude\n1,2\n\n3,4'
    ]) {
      expect(() => normalizeHistory(raw), throwsFormatException);
    }
    expect(normalizeHistory('longitude,latitude\n1,2'),
        isNot(contains('timestamp')));
  });

  test('Dawarich API point array imports only coordinates and timestamps', () {
    final raw = jsonEncode([
      {
        'id': 123,
        'longitude': '10.5',
        'latitude': '-20.5',
        'timestamp': 150,
        'tracker_id': 'private',
        'raw_data': {'secret': 'ignored'}
      }
    ]);
    final out = jsonDecode(normalizeHistory(raw));
    expect(out, {
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [10.5, -20.5]
          },
          'properties': {'timestamp': 150}
        }
      ]
    });
    expect(
        preview(normalizeHistory(raw), auditRoute: true)['routeAudit']
            ['timedPoints'],
        1);
  });
  test('Dawarich array rejects malformed or ambiguous point data', () {
    for (final row in [
      {'longitude': '', 'latitude': '0', 'timestamp': 100},
      {'longitude': '0', 'latitude': 'NaN', 'timestamp': 100},
      {'longitude': 0, 'latitude': 0, 'timestamp': '100'},
      {'longitude': 0, 'latitude': 0, 'timestamp': 1700000000000},
      {'longitude': 181, 'latitude': 0, 'timestamp': 100},
      null
    ]) {
      expect(() => normalizeHistory(jsonEncode([row])), throwsFormatException);
    }
  });
}
