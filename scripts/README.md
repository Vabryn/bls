# BLS data pipeline

All scripts run **from `bls/scripts/`** and read/write `bls/data/`. There is no
orchestrator — run them in the order below when a new BLS release lands or the
map geometry changes. None of this ships to production (`bls/.assetsignore`
excludes `scripts/` and `bls_data/`).

The raw BLS source spreadsheets live in `bls/bls_data/` (git-ignored — they are
~80 MB each and re-downloadable from the BLS OEWS "all data" release page).

## Dependencies

- **Python 3** stdlib only (`zipfile`, `xml.etree`, `csv`, `json`) — no pip packages.
- **Node** for the `.mjs` step: `d3-geo`, `topojson-client`
  (pinned in `bls/package.json`; run `npm ci` from `bls/`).

## Order

| # | Command | Reads | Writes |
|---|---|---|---|
| 1 | `python3 process_bls.py <year>` | `../bls_data/all_data_M_<year>.xlsx`; `../data/2025/areas/` for the education-tier mapping (falls back to `../bls.html`) | `../data/<year>/areas/*.json`, `../data/<year>/areas.json` |
| 2a | `python3 build_area_definitions.py <year>` | `../bls_data/area_definitions_m<year>.xlsx` (BLS county → OEWS area assignments, from <https://www.bls.gov/oes/current/msa_def.htm>; bls.gov blocks scripted downloads, so save it from a browser) | `../data/area_definitions_<year>.json` |
| 2b | `node build_all_statistical_areas.mjs <year>` | `../data/<year>/areas.json`, `../data/area_definitions_<year>.json`, `../data/counties-albers-10m.json` | `../data/metro_shapes.json` (MSA + non-metro polygons, per-county `d` paths) |
| 3 | `python3 build_metro_map_data.py <year>` | `../data/<year>/areas/`, `../data/metro_shapes.json` | `../data/<year>/jobs/*.json`, `../data/<year>/metro_map.json` |
| 4 | `python3 build_place_index.py` | US-cities CSV (`../bls_data/us_cities.csv`, else `/tmp/us_cities.csv`, else the GitHub raw URL), `../data/cbsa_to_counties.json`, `../data/2025/areas.json` | `../data/place_index.json` |

`<year>` defaults to `2025` if omitted. Step 2 only needs re-running when BLS
changes its area definitions or the county atlas changes; steps 1/3 run per
release year, and step 3 must be re-run for every year after step 2.

All years share one `metro_shapes.json`, built from the May 2025 definitions.
BLS redrew its areas between the May 2023 and May 2024 releases, so 2022 and
2023 areas that no longer exist have no outline. The atlas predates
Connecticut's planning regions; `build_all_statistical_areas.mjs` maps the old
Connecticut counties to areas, and Waterbury-Shelton has no outline.

## Static data with no generator here

`../data/us_states_paths.json` and `../data/zip_to_area.json` were generated
once out-of-band and are committed as-is.
