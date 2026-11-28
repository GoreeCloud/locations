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
  if (trimmed.startsWith('[')) {
    final rows = jsonDecode(trimmed);
    if (rows is! List || rows.length > _maxPoints) {
      throw const FormatException('Invalid point array');
    }
    double coordinate(dynamic value) {
      if (value is String && _decimal.hasMatch(value)) {
        value = double.tryParse(value);
      }
      if (value is! num || !value.isFinite) {
        throw const FormatException('Invalid coordinate');
      }
      return value.toDouble();
    }

    final features = <Map<String, dynamic>>[];
    for (final row in rows) {
      if (row is! Map) {
        throw const FormatException('Invalid point record');
      }
      final lon = coordinate(row['longitude']),
          lat = coordinate(row['latitude']);
      final t = row['timestamp'];
      if (lon.abs() > 180 ||
          lat.abs() > 90 ||
          t is! num ||
          !t.isFinite ||
          t < 0 ||
          t > 4102444800 ||
          t != t.truncate()) {
        throw const FormatException('Invalid point record');
      }
      features.add({
        'type': 'Feature',
        'geometry': {
          'type': 'Point',
          'coordinates': [lon, lat]
        },
        'properties': {'timestamp': t.toInt()}
      });
    }
    final out = jsonEncode({'type': 'FeatureCollection', 'features': features});
    if (utf8.encode(out).length > _maxBytes) {
      throw const FormatException('Converted input too large');
    }
    return out;
  }
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
