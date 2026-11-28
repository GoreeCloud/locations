import 'dart:async';
import 'dart:convert';
import 'dart:io';

const _maxBytes = 8 * 1024 * 1024;
const _maxPoints = 20000;
final _seconds = RegExp(r'^\d{1,10}$');
final _key = RegExp(r'^[a-fA-F0-9]{64}$');

Uri historyUri(String origin, String start, String end) {
  final base = Uri.tryParse(origin);
  if (base == null ||
      base.scheme != 'https' ||
      !base.hasAuthority ||
      base.host.isEmpty ||
      base.userInfo.isNotEmpty ||
      base.hasQuery ||
      base.hasFragment ||
      (base.path.isNotEmpty && base.path != '/')) {
    throw const FormatException('Enter an HTTPS server origin only');
  }
  if (!_seconds.hasMatch(start) || !_seconds.hasMatch(end)) {
    throw const FormatException('Invalid time range');
  }
  final a = int.parse(start), b = int.parse(end);
  if (a >= b || b > 4102444800 || b - a > 31 * 86400) {
    throw const FormatException('Invalid time range');
  }
  return base.replace(
      path: '/api/v1/privacy_history',
      queryParameters: {'start_at': start, 'end_at': end});
}

String validateServerHistory(String raw) {
  final doc = jsonDecode(raw);
  if (doc is! Map ||
      doc['type'] != 'FeatureCollection' ||
      doc['features'] is! List ||
      (doc['features'] as List).length > _maxPoints) {
    throw const FormatException('Invalid history');
  }
  final features = <Map<String, dynamic>>[];
  for (final f in doc['features'] as List) {
    if (f is! Map ||
        f['type'] != 'Feature' ||
        f['geometry'] is! Map ||
        f['geometry']['type'] != 'Point' ||
        f['properties'] is! Map) {
      throw const FormatException('Invalid feature');
    }
    final c = f['geometry']['coordinates'], t = f['properties']['timestamp'];
    if (c is! List ||
        c.length != 2 ||
        c.any((v) => v is! num || !v.isFinite) ||
        (c[0] as num).abs() > 180 ||
        (c[1] as num).abs() > 90 ||
        t is! num ||
        !t.isFinite ||
        t != t.truncate() ||
        t < 0 ||
        t > 4102444800) {
      throw const FormatException('Invalid point');
    }
    features.add({
      'type': 'Feature',
      'geometry': {'type': 'Point', 'coordinates': c},
      'properties': {'timestamp': t.toInt()}
    });
  }
  return jsonEncode({'type': 'FeatureCollection', 'features': features});
}

class HistoryTransfer {
  final HttpClient _client = HttpClient();
  HistoryTransfer() {
    _client.connectionTimeout = const Duration(seconds: 10);
    _client.findProxy = (_) => 'DIRECT';
  }
  void cancel() => _client.close(force: true);
  Future<String> retrieve(
      String origin, String start, String end, String key) async {
    try {
      if (!_key.hasMatch(key)) {
        throw const FormatException('Invalid access key');
      }
      final uri = historyUri(origin, start, end);
      return await _read(uri, key).timeout(const Duration(seconds: 30));
    } finally {
      cancel();
    }
  }

  Future<String> _read(Uri uri, String key) async {
    final request = await _client.getUrl(uri);
    request.followRedirects = false;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $key');
    request.headers.set(HttpHeaders.acceptHeader, 'application/geo+json');
    request.headers.set(HttpHeaders.cacheControlHeader, 'no-store');
    final response = await request.close();
    if (response.statusCode != 200 ||
        response.headers.contentType?.mimeType != 'application/geo+json' ||
        response.contentLength > _maxBytes) {
      throw const FormatException('History unavailable');
    }
    final bytes = <int>[];
    await for (final chunk in response) {
      if (bytes.length + chunk.length > _maxBytes) {
        throw const FormatException('History too large');
      }
      bytes.addAll(chunk);
    }
    return validateServerHistory(utf8.decode(bytes));
  }
}
