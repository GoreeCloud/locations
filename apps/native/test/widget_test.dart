import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locations/privacy.dart';
import 'package:locations/main.dart';

void main() {
  test('sample, receipt and metadata minimization', () {
    final r = preview(sample());
    expect(r['receipt'], {
      'input': 22,
      'excluded': 0,
      'suppressed': 10,
      'retained': 12,
      'cells': 1,
      'repeatCoordinates': 19
    });
    expect(r['export'].toString(), isNot(contains('synthetic')));
  });
  test('privacy zone exclusion', () {
    final r = preview(sample(), zone: (lon: 10.01, lat: 20.01, radius: 1.0));
    expect(r['receipt']['excluded'], 12);
    expect(r['receipt']['retained'], 0);
  });
  test('invalid settings rejected', () {
    expect(() => preview(sample(), minimum: 1), throwsFormatException);
    expect(() => preview('bad'), throwsFormatException);
    expect(() => preview(sample(), zone: (lon: 181.0, lat: 0.0, radius: 1.0)),
        throwsFormatException);
  });
  test('antimeridian distance',
      () => expect(distanceKm(179.9, 0, -179.9, 0), lessThan(23)));
  testWidgets('sample action and preview', (tester) async {
    tester.view.physicalSize = const Size(1000, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const LocationsApp());
    await tester.tap(find.text('Load synthetic sample'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview privacy export'));
    await tester.pumpAndSettle();
    expect(find.text('3. Disclosure receipt'), findsOneWidget);
    expect(find.text('Copy aggregate GeoJSON'), findsOneWidget);
  });
}
