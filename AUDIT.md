# BLS audit — 16 September 2026

## Reusable browser + iOS audit

`npm run test:devices` is now the repeatable end-to-end check. It starts an
isolated static server (or uses `BLS_URL`), launches desktop Chromium and an
iPhone 12 touch emulation, records page/console errors, and optionally writes
screenshots plus JSON with `AUDIT_SCREENSHOTS` and `AUDIT_JSON`.

The audit exercises:

- data boot, duplicate IDs, accessible names, map-region count, and overflow;
- theme switching, all six metrics, area/bubble modes, zoom buttons, wheel
  zoom, reset, keyboard state selection, horizontal drag/pan, and tooltips;
- state, ZIP, place, and polygon area selection plus clear;
- occupation search, sector/education/wage filters, table sorting, regional
  occupation drilldown, region filtering, wage switching, row selection, and
  back/clear behavior;
- `year`, `area`, and `occ` deep links;
- iPhone touch targets, map → Summary → browser order, touch controls, internal
  table scrolling, and no horizontal page overflow.

Result on 16 September 2026: **10/10 PASS locally and 10/10 PASS against
`https://bls.riverakarom.com/`**. The production run captured screenshots in
`/private/tmp/bls-audit-live` and a machine-readable report in
`/private/tmp/bls-audit-live.json`.

The iPhone run is Chromium device emulation (including touch/pointer media
queries), not a physical Safari/VoiceOver session. The remaining design notes
are the long keyboard sequence for ~510 map regions, intentionally removed
first-use guidance, and `style-src 'unsafe-inline'` pending a larger style
migration.

## Earlier findings

Confirmed by browser reproductions: blocked localStorage prevented initialization; an older network response overwrote a later cached area/occupation selection; failed area fetches changed selection while leaving old data visible. Theme storage is now optional, every selection invalidates older requests, and area state commits only after validated data arrives. Failed loads have an inline recovery message.

Phone metric controls now wrap into six reachable buttons, summary figures use two columns, filters have readable touch-sized inputs, and wage disclosures remain visible on phones.

Censored wages (`≥ $239,200`) previously generated exact percentage comparisons. Those comparisons are now suppressed. Existing annual-equivalent and prior-year disclosures are retained. No published observation was rewritten. Data validation covers 2,344 annual area files and 892,204 occupation records; apparent ordering inversions involving a censored bound are not evidence of an incorrect source observation.

`npm test` runs the data validator and eleven browser scenarios, including both themes at 320–1440px. Before fixes, the four original failure scenarios failed; after fixes, they pass. Offline map-generation dependencies and browser tooling now have a lockfile. Runtime files, pipeline inputs, intentional archives and test artifacts are documented and separated in deployment exclusions. `_headers` now uses a strict script policy without `unsafe-inline`, allowing only Cloudflare's required beacon origin, and adds MIME, permissions, and referrer protections.

Limits: this is a statistical explorer, not salary prediction or financial advice. Annual equivalents assume 2,080 hours; map ordering cannot recover values hidden behind a top code. Source spreadsheets were not regenerated. Physical-device Safari/Android and full assistive-technology testing remain outside this Chromium pass. Existing inline style attributes still require `style-src 'unsafe-inline'`; migrating those styles is a separate hardening task.

Sources: [OEWS methodology](https://www.bls.gov/oes/methods_25.pdf), [published tables](https://www.bls.gov/oes/tables.htm).
