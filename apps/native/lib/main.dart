import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'privacy.dart';
import 'history.dart';
import 'server_history.dart';

void main() => runApp(const LocationsApp());

class LocationsApp extends StatelessWidget {
  const LocationsApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'GoreeCloud Locations',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xff2346ca),
              surface: const Color(0xffffffff)),
          scaffoldBackgroundColor: const Color(0xfff6f7fb)),
      darkTheme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xffbfcbff), brightness: Brightness.dark)),
      home: const Workspace());
}

class Workspace extends StatefulWidget {
  const Workspace({super.key});
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  final input = TextEditingController(),
      grid = TextEditingController(text: '0.1'),
      minimum = TextEditingController(text: '10'),
      lon = TextEditingController(),
      lat = TextEditingController(),
      radius = TextEditingController(text: '1');
  final origin = TextEditingController(),
      start = TextEditingController(),
      end = TextEditingController(),
      accessKey = TextEditingController();
  HistoryTransfer? transfer;
  bool retrieving = false;
  Map<String, dynamic>? result;
  String? error;
  bool useZone = false;
  bool protectCells = true;
  bool auditRoute = false;
  void invalidate() => setState(() {
        transfer?.cancel();
        transfer = null;
        retrieving = false;
        result = null;
        error = null;
      });
  @override
  void dispose() {
    transfer?.cancel();
    for (final c in [
      input,
      grid,
      minimum,
      lon,
      lat,
      radius,
      origin,
      start,
      end,
      accessKey
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> retrieve() async {
    invalidate();
    final current = HistoryTransfer();
    final key = accessKey.text;
    accessKey.clear();
    transfer = current;
    setState(() => retrieving = true);
    try {
      final text =
          await current.retrieve(origin.text, start.text, end.text, key);
      if (mounted && identical(transfer, current)) {
        input.text = text;
        invalidate();
      }
    } catch (_) {
      if (mounted && identical(transfer, current)) {
        setState(() {
          retrieving = false;
          transfer = null;
          error =
              'Server history unavailable. Check HTTPS server, access key and time interval.';
        });
      }
    }
  }

  void run() {
    invalidate();
    try {
      final r = preview(normalizeHistory(input.text),
          grid: double.parse(grid.text),
          minimum: int.parse(minimum.text),
          protectCells: useZone && protectCells,
          auditRoute: auditRoute,
          zone: useZone
              ? (
                  lon: double.parse(lon.text),
                  lat: double.parse(lat.text),
                  radius: double.parse(radius.text)
                )
              : null);
      setState(() => result = r);
    } catch (_) {
      setState(() => error =
          'Could not process input. Check history format, limits and privacy settings.');
    }
  }

  Widget number(String label, TextEditingController c) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
          controller: c,
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          keyboardType: const TextInputType.numberWithOptions(
              decimal: true, signed: true),
          onChanged: (_) => invalidate()));
  @override
  Widget build(BuildContext context) {
    final receipt = result?['receipt'] as Map?;
    final route = result?['routeAudit'] as Map?;
    return Scaffold(
        appBar: AppBar(title: const Text('GoreeCloud Locations')),
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 900),
                    child:
                        ListView(padding: const EdgeInsets.all(24), children: [
                      Text('Privacy workspace',
                          style: Theme.of(context).textTheme.headlineMedium),
                      const Text(
                          'Development preview · Local processing. Optional read-only HTTPS server retrieval; no location permission or mandatory account.'),
                      const SizedBox(height: 24),
                      Text('1. Location history',
                          style: Theme.of(context).textTheme.titleLarge),
                      ExpansionTile(
                        title:
                            const Text('Retrieve from your GoreeCloud server'),
                        children: [
                          const Text(
                              'Optional read-only transfer to the HTTPS server you enter. Access key is not saved. Use up to 31 days in Unix seconds.'),
                          TextField(
                              controller: origin,
                              decoration: const InputDecoration(
                                  labelText: 'HTTPS server origin'),
                              autocorrect: false,
                              onChanged: (_) => invalidate()),
                          OutlinedButton(
                              onPressed: () {
                                final now =
                                    DateTime.now().millisecondsSinceEpoch ~/
                                        1000;
                                start.text = (now - 7 * 86400).toString();
                                end.text = now.toString();
                                invalidate();
                              },
                              child: const Text('Last 7 days')),
                          number('Start (Unix seconds)', start),
                          number('End (exclusive, Unix seconds)', end),
                          TextField(
                              controller: accessKey,
                              obscureText: true,
                              autocorrect: false,
                              enableSuggestions: false,
                              decoration: const InputDecoration(
                                  labelText: 'Server access key'),
                              onChanged: (_) => invalidate()),
                          FilledButton(
                              onPressed: retrieving ? null : retrieve,
                              child: Text(retrieving
                                  ? 'Retrieving…'
                                  : 'Retrieve private history')),
                          if (retrieving)
                            OutlinedButton(
                                onPressed: invalidate,
                                child: const Text('Cancel retrieval')),
                        ],
                      ),
                      OutlinedButton(
                          onPressed: () {
                            input.text = sample();
                            invalidate();
                          },
                          child: const Text('Load synthetic sample')),
                      const Text(
                          'CSV header: longitude,latitude or longitude,latitude,timestamp (Unix seconds). No quoted fields or extra columns.'),
                      TextField(
                          controller: input,
                          maxLines: 5,
                          decoration: const InputDecoration(
                              labelText:
                                  'Paste GeoJSON, CSV or Dawarich point JSON (8 MiB maximum)',
                              border: OutlineInputBorder()),
                          onChanged: (_) => invalidate()),
                      OutlinedButton(
                          onPressed: () {
                            input.clear();
                            origin.clear();
                            start.clear();
                            end.clear();
                            accessKey.clear();
                            lon.clear();
                            lat.clear();
                            useZone = false;
                            invalidate();
                          },
                          child: const Text('Clear private data')),
                      const SizedBox(height: 24),
                      Text('2. Privacy controls',
                          style: Theme.of(context).textTheme.titleLarge),
                      number('Grid size (degrees)', grid),
                      number('Minimum points per cell', minimum),
                      SwitchListTile(
                          title: const Text('Exclude a sensitive area'),
                          value: useZone,
                          onChanged: (v) {
                            useZone = v;
                            invalidate();
                          }),
                      if (useZone) ...[
                        number('Longitude', lon),
                        number('Latitude', lat),
                        number('Radius (km)', radius),
                        SwitchListTile(
                            title: const Text(
                                'Suppress cells that may overlap the zone (recommended)'),
                            value: protectCells,
                            onChanged: (v) {
                              protectCells = v;
                              invalidate();
                            })
                      ],
                      SwitchListTile(
                          title: const Text('Audit route timing (local only)'),
                          value: auditRoute,
                          onChanged: (v) {
                            auditRoute = v;
                            invalidate();
                          }),
                      FilledButton(
                          onPressed: input.text.isEmpty ? null : run,
                          child: const Text('Preview privacy export')),
                      const Text(
                          'Aggregation is not anonymity. Enhanced protection suppresses potentially overlapping cells. Review before sharing.'),
                      const SizedBox(height: 24),
                      Text('3. Disclosure receipt',
                          style: Theme.of(context).textTheme.titleLarge),
                      if (error != null)
                        Text(error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error)),
                      if (receipt != null) ...[
                        for (final e in receipt.entries)
                          ListTile(
                              title: Text(e.key.toString()),
                              trailing: Text(e.value.toString())),
                        if (route != null) ...[
                          const Text('Route integrity'),
                          for (final e in route.entries)
                            ListTile(
                                title: Text(e.key.toString()),
                                trailing: Text(e.value.toString())),
                          const Text(
                              'Input order; integer Unix seconds only. Speeds above 350 km/h are review flags, not proof of invalid data. Not exported.'),
                        ],
                        OutlinedButton(
                            onPressed: () async {
                              final yes = await showDialog<bool>(
                                  context: context,
                                  builder: (ctx) => AlertDialog(
                                          title: const Text(
                                              'Copy aggregate export?'),
                                          content: const Text(
                                              'The system clipboard may be accessible to other apps. This exports aggregate cells, not the receipt.'),
                                          actions: [
                                            TextButton(
                                                onPressed: () =>
                                                    Navigator.pop(ctx, false),
                                                child: const Text('Cancel')),
                                            FilledButton(
                                                onPressed: () =>
                                                    Navigator.pop(ctx, true),
                                                child: const Text('Copy'))
                                          ]));
                              if (yes == true && mounted && result != null) {
                                await Clipboard.setData(ClipboardData(
                                    text: jsonEncode(result!['export'])));
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                          content: Text('Aggregate copied')));
                                }
                              }
                            },
                            child: const Text('Copy aggregate GeoJSON')),
                      ] else
                        const Text('No result yet.'),
                      const SizedBox(height: 16),
                      const Text(
                          'Independent Dawarich import in development · AGPL-3.0'),
                    ])))));
  }
}
