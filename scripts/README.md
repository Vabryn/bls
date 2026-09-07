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
  (already installed at `bls/node_modules/`; `npm i d3-geo topojson-client` to refresh).

## Order

| # | Command | Reads | Writes |
|---|---|---|---|
| 1 | `python3 process_bls.py <year>` | `../bls_data/all_data_M_<year>.xlsx`; `../data/2025/areas/` for the education-tier mapping (falls back to `../bls.html`) | `../data/<year>/areas/*.json`, `../data/<year>/areas.json` |
| 2 | `node build_all_statistical_areas.mjs` | `../data/areas.json`, `../data/cbsa_to_counties.json`, `../data/counties-albers-10m.json` | `../data/metro_shapes.json` (MSA + non-metro polygons, per-county `d` paths) |
| 3 | `python3 build_metro_map_data.py <year>` | `../data/<year>/areas/`, `../data/metro_shapes.json` | `../data/<year>/jobs/*.json`, `../data/<year>/metro_map.json` |
| 4 | `python3 build_place_index.py` | US-cities CSV (`../bls_data/us_cities.csv`, else `/tmp/us_cities.csv`, else the GitHub raw URL), `../data/cbsa_to_counties.json`, `../data/2025/areas.json` | `../data/place_index.json` |

`<year>` defaults to `2025` if omitted. Step 2 only needs re-running when the
CBSA↔county crosswalk or the county atlas changes; steps 1/3 run per release year.

## Static data with no generator here

`../data/us_states_paths.json` and `../data/zip_to_area.json` were generated
once out-of-band and are committed as-is.
