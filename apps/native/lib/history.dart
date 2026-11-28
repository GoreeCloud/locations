import 'dart:convert';

const _maxBytes = 8 * 1024 * 1024;
const _maxPoints = 100000;
final _decimal = RegExp(r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$');
final _seconds = RegExp(r'^\d{1,10}$');
String normalizeHistory(String text) {
  if (utf8.encode(text).length > _maxBytes) {
    throw const FormatException('Input too large');
  }
  final trimmed = text.replaceFirst(RegExp(r'^\uFEFF'), '').trim();
  if (trimmed.startsWith('{')) return trimmed;
  final lines = trimmed.split(RegExp(r'\r?\n'));
  final header = lines.removeAt(0).split(',').map((x) => x.trim()).join(',');
  final timed = header == 'longitude,latitude,timestamp';
  if (!timed && header != 'longitude,latitude') {
    throw const FormatException('Unsupported CSV header');
  }
  if (lines.length > _maxPoints) throw const FormatException('Too many points');
  final features = <Map<String, dynamic>>[];
  for (final line in lines) {
    final fields = line.split(',').map((x) => x.trim()).toList();
    if (fields.length != (timed ? 3 : 2) ||
        !_decimal.hasMatch(fields[0]) ||
        !_decimal.hasMatch(fields[1])) {
      throw const FormatException('Invalid CSV row');
    }
    final lon = double.parse(fields[0]), lat = double.parse(fields[1]);
    if (!lon.isFinite || !lat.isFinite || lon.abs() > 180 || lat.abs() > 90) {
      throw const FormatException('Invalid coordinates');
    }
    final properties = <String, dynamic>{};
    if (timed && fields[2].isNotEmpty) {
      if (!_seconds.hasMatch(fields[2])) {
        throw const FormatException('Invalid Unix seconds');
      }
      final t = int.parse(fields[2]);
      if (t > 4102444800) throw const FormatException('Invalid Unix seconds');
      properties['timestamp'] = t;
    }
    features.add({
      'type': 'Feature',
      'geometry': {
        'type': 'Point',
        'coordinates': [lon, lat]
      },
      'properties': properties
    });
  }
  final out = jsonEncode({'type': 'FeatureCollection', 'features': features});
  if (utf8.encode(out).length > _maxBytes) {
    throw const FormatException('Converted input too large');
  }
  return out;
}
