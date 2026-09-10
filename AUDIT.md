# BLS audit — 10 September 2026

Confirmed by browser reproductions: blocked localStorage prevented initialization; an older network response overwrote a later cached area/occupation selection; failed area fetches changed selection while leaving old data visible. Theme storage is now optional, every selection invalidates older requests, and area state commits only after validated data arrives. Failed loads have an inline recovery message.

Phone metric controls now wrap into six reachable buttons, summary figures use two columns, filters have readable touch-sized inputs, and wage disclosures remain visible on phones.

Censored wages (`≥ $239,200`) previously generated exact percentage comparisons. Those comparisons are now suppressed. Existing annual-equivalent and prior-year disclosures are retained. No published observation was rewritten. Data validation covers 2,344 annual area files and 892,204 occupation records; apparent ordering inversions involving a censored bound are not evidence of an incorrect source observation.

`npm test` runs the data validator and seven browser scenarios, including both themes at 320–1440px. Before fixes, the four original failure scenarios failed; after fixes, they pass. Offline map-generation dependencies and browser tooling now have a lockfile. Runtime files, pipeline inputs, intentional archives and test artifacts are documented and separated in deployment exclusions. `_headers` limits script/font/network sources and adds MIME and permissions protections.

Limits: this is a statistical explorer, not salary prediction or financial advice. Annual equivalents assume 2,080 hours; map ordering cannot recover values hidden behind a top code. Source spreadsheets were not regenerated. Physical-device Safari/Android and assistive-technology testing remain outside this Chromium pass. Inline handlers still require `unsafe-inline` in script CSP; removing them is a future migration, not an excuse to claim a strict nonce-based policy.

Sources: [OEWS methodology](https://www.bls.gov/oes/methods_25.pdf), [published tables](https://www.bls.gov/oes/tables.htm).
