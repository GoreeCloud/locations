# Third-party attribution and integration boundaries

GoreeCloud Locations is an independently implemented development project. It does **not** copy Life360 proprietary software or claim to offer its emergency service.

- **Traccar**: upstream `traccar/traccar`, Apache License 2.0, reference commit `c806922f874011f70aaab23394af682668d8d5b9` (observed 2026-11-18). A standalone JSON route-report importer uses its published REST protocol. The Traccar server and protocol decoder code are **not copied**, bundled or deployed.
- **Dawarich**: upstream `Freika/dawarich`, AGPL-3.0, reference commit `f6b79c9b826f1d1e1ff7e0e3d7d1b252084dddfe` (observed 2026-11-18). Supported as an interoperable GeoJSON export format. No AGPL-licensed Dawarich implementation is copied into this source tree; if future import occurs, maintain distinct licensing and network source-offer obligations.
- **MapLibre GL JS**: open-source map visualization dependency, included by package manager, with attribution through upstream distribution. Public OpenStreetMap raster tiles are opt-in only; the data/map-tiles provider is not operated by GoreeCloud.
- **GoreeCloud UI**: centrally maintained `GoreeCloud/gc-ui`, MIT License, generated web token CSS vendored under `vendor/gc-ui/` with verbatim license. Follow `vendor/gc-ui/SOURCE.md` for pinned source revision.
- **PostgreSQL + PostGIS**: independently licensed infrastructure; Docker compose downloads a pinned-major public `postgis/postgis` image.
- **Node.js, React, Vite, nginx, Kotlin, AndroidX Compose and OkHttp**: third-party packages distributed under their respective applicable notices/licenses; see source manifests and transitive package metadata.

The repository's Apache-2.0 grant applies to original GoreeCloud source, not to third-party materials with separate notices/licenses. Verify all distribution obligations prior to release.
