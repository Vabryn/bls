import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Builds data/metro_shapes.json: one merged outline per OEWS MSA and
// nonmetropolitan area, from the BLS county assignments
// (data/area_definitions_<year>.json, see build_area_definitions.py) and the
// county atlas. Usage: node build_all_statistical_areas.mjs [year=2025]

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

// The atlas (us-atlas, 2017 vintage) predates two county changes in the BLS
// definitions. Its retired county codes are assigned here instead:
// - Alaska split Valdez-Cordova (02261) into Chugach and Copper River, both in
//   the Alaska nonmetropolitan area.
// - Connecticut replaced its 8 counties with 9 planning regions. Each old
//   county goes to the area covering most of it. Waterbury-Shelton (47930) is
//   mostly in old New Haven County, so it gets no outline.
const ATLAS_LEGACY_COUNTIES = {
  '02261': { area: '0200006', name: 'Valdez-Cordova Census Area' },
  '09001': { area: '14860', name: 'Fairfield County' },
  '09003': { area: '25540', name: 'Hartford County' },
  '09005': { area: '0900001', name: 'Litchfield County' },
  '09007': { area: '25540', name: 'Middlesex County' },
  '09009': { area: '35300', name: 'New Haven County' },
  '09011': { area: '35980', name: 'New London County' },
  '09013': { area: '25540', name: 'Tolland County' },
  '09015': { area: '0900001', name: 'Windham County' },
};

function main(year = '2025') {
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, year, 'areas.json'), 'utf8'));
  const definitions = JSON.parse(fs.readFileSync(path.join(dataDir, `area_definitions_${year}.json`), 'utf8'));
  const us = JSON.parse(fs.readFileSync(path.join(dataDir, 'counties-albers-10m.json'), 'utf8'));
  const pathGen = d3.geoPath();

  const countiesByArea = new Map();
  const unassigned = [];
  for (const g of us.objects.counties.geometries) {
    const fips = String(g.id).padStart(5, '0');
    const def = definitions[fips] || ATLAS_LEGACY_COUNTIES[fips];
    if (!def) { unassigned.push(fips); continue; }
    if (!countiesByArea.has(def.area)) countiesByArea.set(def.area, []);
    countiesByArea.get(def.area).push({ fips, name: def.name, geom: g });
  }

  const allShapes = {};
  const noOutline = [];
  for (const a of manifest.filter(a => a.type === 'msa' || a.type === 'nonmetro')) {
    const counties = countiesByArea.get(a.id) || [];
    if (!counties.length) { noOutline.push(`${a.id} ${a.name}`); continue; }
    const merged = topojson.merge(us, counties.map(c => c.geom));
    const bounds = pathGen.bounds(merged);
    allShapes[a.id] = {
      id: a.id,
      name: a.name,
      type: a.type,
      state: a.state,
      // Matches the previous output: MSAs fall back to the first two digits of
      // the CBSA code.
      stateFips: (a.type === 'msa' && a.stateFips) || a.id.substring(0, 2),
      d: pathGen(merged),
      bounds: [
        [Math.round(bounds[0][0]), Math.round(bounds[0][1])],
        [Math.round(bounds[1][0]), Math.round(bounds[1][1])]
      ],
      cx: Math.round(((bounds[0][0] + bounds[1][0]) / 2) * 10) / 10,
      cy: Math.round(((bounds[0][1] + bounds[1][1]) / 2) * 10) / 10,
      counties: counties.map(c => ({ fips: c.fips, name: c.name, d: pathGen(topojson.feature(us, c.geom)) }))
    };
  }

  if (unassigned.length) console.warn(`Atlas counties with no BLS area: ${unassigned.join(', ')}`);
  if (noOutline.length) console.warn(`Areas with no atlas counties (not drawn):\n  ${noOutline.join('\n  ')}`);
  const outPath = path.join(dataDir, 'metro_shapes.json');
  fs.writeFileSync(outPath, JSON.stringify(allShapes));
  console.log(`Saved ${Object.keys(allShapes).length} area shapes to ${outPath} (${Math.round(fs.statSync(outPath).size / 1024)} KB).`);
}

main(process.argv[2]);
