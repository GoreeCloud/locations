# GoreeCloud UI source authority

This folder contains an unmodified copy of the **generated** canonical CSS tokens from `GoreeCloud/gc-ui` (`src/tokens.css`) and the matching upstream MIT license. Provenance is checked against the source commit before future updates. This vendoring is intentional because `gc-ui` is not yet published to a registry; it is not a replacement for that repository's design authority.

When updating: check the specific commit and token checksum, copy its generated `src/tokens.css` and MIT license, update the pinned revision here, run web build and review accessibility/visual diffs. Do not alter token values locally. Native Compose theme bridges are alpha approximations; verify and migrate when the canonical native adapter is ready.

Pinned git SHA: `79949b3db58f2214e8d4c4eb2b647f75e1cfc724`
