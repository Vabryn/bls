# BLS Wage Explorer

An interactive map + browser for U.S. occupational wages, built on the
Bureau of Labor Statistics **OEWS (May 2025)** release. Pick any state, metro
area, non‑metropolitan region, or ZIP code and see how ~800 occupations across
22 career sectors pay there — against the national baseline, by percentile,
and by how concentrated each field is in that local economy.

**Live:** <https://bls.riverakarom.com>

<p align="center">
  <img src="docs/01-map-national.png" alt="National choropleth of median wages with the sector browser and summary tearsheet" width="100%">
</p>

---

## What it does

| | |
|---|---|
| **National → local** | Start on a county‑level choropleth of the whole country, then search a state / metro / non‑metro area / 5‑digit ZIP to zoom to it and re‑scope every panel. |
| **Six lenses on the same geography** | Median, Mean, Bottom 25% (P25), Top 25% (P75), Employment, and **Density** (location quotient — how over/under‑represented a field is locally vs nationally). |
| **Two map styles** | Area choropleth or proportional bubbles. |
| **Sector browser** | The right panel opens on the 22 SOC major groups; drill a sector → its occupations → per‑region breakdown for one occupation, with a breadcrumb the whole way down. |
| **Comparison built in** | Every wage is shown with its delta vs the U.S. figure; the legend pins both the selected area and the national marker on a shared gradient. |
| **Summary tearsheet** | A fixed panel under the map: total employment, annual median, annual mean, and the area's top sector concentration — each with its "vs U.S." line. |

<p align="center">
  <img src="docs/02-map-area-selected.png" alt="Alaska selected: region outline on the map, Alaska sector table with density badges, Alaska summary" width="49%">
  <img src="docs/03-map-light.png" alt="Same view in light theme" width="49%">
</p>

---

## How it's built

- **No build step.** Markup lives in `index.html`, styles in `css/styles.css`,
  and application logic in `js/app.js` and `js/constants.js`. The browser loads
  no JavaScript framework; Google Fonts is an external font dependency.
- **Hand‑rolled SVG map.** An Albers‑USA projection (`viewBox="0 0 975 610"`)
  with a `<g>` zoom/pan group; choropleth, bubble, and selected‑region overlay
  layers are toggled in place.
- **Static data, fetched on demand.** The app makes **zero calls to bls.gov at
  runtime.** It reads pre‑built JSON from `data/` — a manifest plus one file per
  area, loaded lazily as you navigate. Occupation‑by‑region breakdowns and map
  colour data are split into per‑SOC and per‑year files so first paint stays small.
- **Deploy:** Cloudflare Workers static assets. `npx wrangler@4 deploy` from this
  folder publishes to the custom domain. `.assetsignore` keeps the data pipeline,
  source spreadsheets, and docs out of the bundle.

### Data pipeline (`scripts/`)

The published `data/` directory is generated offline from the BLS source
spreadsheets in `bls_data/` (git‑ignored — ~80 MB each, re‑downloadable from the
BLS OEWS "All Data" release). Nothing here runs in production.

| Step | Script | In → Out |
|---|---|---|
| 1 | `process_bls.py <year>` | `bls_data/all_data_M_<year>.xlsx` → `data/<year>/areas/*.json`, `areas.json` |
| 2 | `build_all_statistical_areas.mjs` | CBSA↔county crosswalk + county atlas → `data/metro_shapes.json` (MSA + non‑metro polygons) |
| 3 | `build_metro_map_data.py <year>` | per‑area data + shapes → `data/<year>/jobs/*.json`, `metro_map.json` |
| 4 | `build_place_index.py` | US‑cities CSV + crosswalk → `data/place_index.json` (ZIP / city → area) |

Full notes: [`scripts/README.md`](scripts/README.md).

---

## Run it locally

No install needed — just serve the folder statically so `fetch()` can read `data/`:

```bash
cd bls
python3 -m http.server 8000
# open http://localhost:8000
```

Regenerating data additionally needs Python 3 (stdlib only) and, for step 2,
Node with `d3-geo` + `topojson-client`, pinned as development dependencies. Run `npm ci` first.

---

## Project structure

```
bls/
├── index.html            markup + layout
├── css/
│   └── styles.css        design system and map styles
├── js/
│   ├── app.js            map logic, interactivity, and UI
│   └── constants.js      static arrays and configurations
├── data/                 generated JSON served to the client
│   ├── areas.json        area manifest
│   ├── <year>/areas/     one file per state / metro / non-metro area
│   ├── <year>/jobs/      per-occupation regional breakdowns
│   ├── metro_shapes.json MSA + non-metro polygons
│   └── place_index.json  ZIP / city → area lookup
├── scripts/              offline data pipeline (not deployed)
├── bls_data/             raw BLS .xlsx sources (git-ignored, not deployed)
└── wrangler.jsonc        Cloudflare static-assets deploy config
```

---

## Data source & accuracy

Published figures come from the BLS Occupational Employment and Wage Statistics
(OEWS) program. The app includes 2022–2025 releases and defaults to 2025. It may
use a prior release when an occupation lacks wage data; the interface discloses
the source year. Hourly-only wages are displayed as annual equivalents using
2,080 hours, not actual annual earnings. This distinction matters for irregular
schedules such as acting and dancing.

`≥ $239,200` is a published lower bound, not an exact wage. Exact percentage
comparisons are suppressed when either wage is this censored value. Map colors
and ordering still use published bounds and should not be read as precise
rankings among top-coded occupations. Missing/suppressed values are not zero.
The client reads committed JSON and does not modify source observations.

Sources: [BLS tables](https://www.bls.gov/oes/tables.htm) and
[2025 methodology](https://www.bls.gov/oes/methods_25.pdf).

## Checks

Use Node 22.12+ and Python 3:

```bash
npm ci
npm test
```

The Python check validates numeric values and uncensored percentile ordering in
all annual area files. Browser tests reproduce blocked storage, out-of-order
loads, failed requests and censored-wage comparisons, then check both themes at
phone, tablet and desktop widths. Tests start an isolated localhost server.
Set `AUDIT_SCREENSHOTS` to a directory to retain screenshots. These checks do not
replace a physical Safari/Android pass or a source-spreadsheet reconciliation.

Historical `bls.html` remains a pipeline education-mapping fallback;
`bls_draft.html` remains an intentional design snapshot. Neither is deployed.
See [AUDIT.md](AUDIT.md) for scope and remaining limitations.

## License

Proprietary — see [`LICENSE`](LICENSE). Published for portfolio review only; no
reuse, redistribution, or commercial use without written permission.
