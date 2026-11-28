# GoreeCloud Locations

Privacy-first, self-hosted location intelligence for individuals and families.

**Development status:** rebranded import in progress. The full Dawarich derivative is staged locally and is not yet included here. This repository provides the independently authored offline Private Grid Export CLI and web/native privacy workspace previews. It is not a full location-history server, stable release, or production deployment.

## Private Grid Export

Requires Ruby 3.2+ and its standard library; tests use Minitest.

```sh
bin/gc-private-grid --grid-degrees 0.1 --minimum-points 10 input.geojson output.geojson
ruby test/goreecloud/private_grid_test.rb
```

Input: point-only GeoJSON FeatureCollection (up to 64 MiB and one million features). Output: angular grid polygons with point counts, excluding sparse cells, source identifiers, timestamps, exact points and metadata. No network requests, cloud account, payment or license verification. A new mode-0600 output file is created without overwriting existing files. Aggregation is not anonymity; locations can still be inferred, and repeated points are not independent people. Review output privately before sharing. Use synthetic input for tests.

## Upstream lineage and independent maintenance

Planned full application baseline: [Dawarich 1.23.0](https://github.com/Freika/dawarich/releases/tag/1.23.0), commit `f6b79c9b826f1d1e1ff7e0e3d7d1b252084dddfe`, released November 15, 2026, AGPL-3.0. Dawarich is created by Evgenii Burmakin and contributors. GoreeCloud Locations is an independently maintained derivative initiative, not an official Dawarich release.

The full source import is intentionally gated on component/asset rights, source and security review, no-paid-feature verification, external network isolation, safe installation, tests and CI. See [import acceptance](docs/IMPORT-ACCEPTANCE.md).

## Free and open-source policy

No subscriptions, mandatory license fees, artificial seat limits, paid feature tiers, mandatory external cloud accounts or license verification, advertising, unauthorized telemetry, or vendor lock-in. Data and infrastructure remain user-controlled. Transparent source and upstream attribution are required. These are acceptance requirements, not a claim of full-server compliance.

## License

[GNU Affero General Public License version 3](LICENSE). Third-party components and notices will be preserved under their applicable licenses when admitted. Source for any deployed modified AGPL application must be made available in accordance with the license.

## Applications (development preview)

- `apps/web`: React browser application; locally process a file or pasted Point GeoJSON. Run `npm ci --ignore-scripts`, `npm test`, `npm run build` in that directory. Serve the generated `dist/` on a local static server; production CSP denies network connections. No external map resources.
- `apps/native`: Flutter native Linux and Android workspace. See its README for build/test commands. Paste or load synthetic GeoJSON, preview and explicitly copy aggregate output. No location collection, server sync or account access yet.

Both implement optional radius-based Privacy Zone exclusion, sparse cell suppression, a disclosure receipt (input/excluded/suppressed/retained counts), repeat-coordinate count, and explicit export. Privacy zones are not saved. Counts can still disclose sensitive patterns, repeated measurements are not independent people, and cells may overlap excluded areas. The receipt is not exported. The apps are independent first-party preview clients and do not yet contain or connect to the complete Dawarich server.

GoreeCloud UI semantic colors and spacing were selected from the alpha candidate tokens at `cc3e1042dcb13a1c821661ba232c734f230237b6`; see `docs/GC-UI-LICENSE.txt`. Full component adoption, accessibility review and all remaining MIPS integrations are pending. Flutter-generated scaffolding is subject to its BSD license (see `docs/FLUTTER-LICENSE.txt`); npm and Dart dependencies retain their respective licenses.
