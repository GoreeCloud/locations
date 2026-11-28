# GoreeCloud Locations

Privacy-first, self-hosted location intelligence for individuals and families.

**Development status:** rebranded import in progress. The full Dawarich derivative is staged locally and is not yet included here. This repository currently provides an independently authored, tested offline Private Grid Export tool. It is not a server, application release, or production deployment.

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
