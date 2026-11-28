import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:locations/server_history.dart';

void main() {
  test('HTTPS origin and bounded path only', () {
    expect(historyUri('https://example.invalid', '100', '200').toString(),
        'https://example.invalid/api/v1/privacy_history?start_at=100&end_at=200');
    for (final url in [
      'http://example.invalid',
      'https://user@example.invalid',
      'https://example.invalid/other',
      'https://example.invalid?x=1',
      'https://example.invalid/#x',
      'file:///tmp/x'
    ]) {
      expect(() => historyUri(url, '100', '200'), throwsFormatException);
    }
    expect(() => historyUri('https://example.invalid', '100', '3000000'),
        throwsFormatException);
  });
  test('minimal point payload', () {
    final raw = jsonEncode({
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [10, 20]
          },
          'properties': {'timestamp': 150, 'private': 'discard'},
          'id': 1
        }
      ]
    });
    expect(jsonDecode(validateServerHistory(raw)), {
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [10, 20]
          },
          'properties': {'timestamp': 150}
        }
      ]
    });
    expect(
        () => validateServerHistory(
            '{"type":"FeatureCollection","features":[null]}'),
        throwsFormatException);
  });
  test('invalid key fails before network', () async {
    await expectLater(
        HistoryTransfer()
            .retrieve('https://example.invalid', '100', '200', 'bad'),
        throwsFormatException);
  });
}
