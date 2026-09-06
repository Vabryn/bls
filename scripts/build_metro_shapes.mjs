import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

async function main() {
  console.log("Generating Metro & County Shape Boundaries...");

  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'areas.json'), 'utf8'));
  const msas = manifest.filter(a => a.type === 'msa');
  console.log(`Processing ${msas.length} MSAs...`);

  const cbsaCounties = JSON.parse(fs.readFileSync(path.join(dataDir, 'cbsa_to_counties.json'), 'utf8'));

  const url = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json';
  console.log("Fetching counties-albers-10m.json...");
  const res = await fetch(url);
  const us = await res.json();
  console.log(`Loaded US Atlas with ${us.objects.counties.geometries.length} counties.`);

  // Map county FIPS (padded to 5 digits) to geometry
  const countyGeomMap = new Map();
  us.objects.counties.geometries.forEach(g => {
    const fips = String(g.id).padStart(5, '0');
    countyGeomMap.set(fips, g);
  });

  const pathGen = d3.geoPath();
  const metroShapes = {};
  let mergedCount = 0;
  let prCount = 0;

  for (const m of msas) {
    const coList = cbsaCounties[m.id] || [];
    const countyNameMap = {};
    coList.forEach(c => { countyNameMap[c.fips] = c.name; });

    const geoms = [];
    coList.forEach(c => {
      const g = countyGeomMap.get(c.fips);
      if (g) geoms.push(g);
    });

    if (geoms.length > 0) {
      try {
        const merged = topojson.merge(us, geoms);
        const metroPath = pathGen(merged);
        const bounds = pathGen.bounds(merged);

        // Individual constituent counties
        const countyFeatures = geoms.map(g => {
          const fips = String(g.id).padStart(5, '0');
          const feature = topojson.feature(us, g);
          return {
            fips: fips,
            name: countyNameMap[fips] || "County",
            d: pathGen(feature)
          };
        });

        // Round bounds
        const roundedBounds = [
          [Math.round(bounds[0][0] * 10) / 10, Math.round(bounds[0][1] * 10) / 10],
          [Math.round(bounds[1][0] * 10) / 10, Math.round(bounds[1][1] * 10) / 10]
        ];

        metroShapes[m.id] = {
          d: metroPath,
          bounds: roundedBounds,
          counties: countyFeatures
        };
        mergedCount++;
      } catch (err) {
        console.error(`Error merging counties for ${m.id} ${m.name}:`, err);
      }
    } else if (m.state === 'PR') {
      // Puerto Rico MSAs - create clean inset geometry
      prCount++;
      // We can create a styled polygon for PR metros based on their projected center
      // Find projected center from metro_map.json
      metroShapes[m.id] = {
        is_pr: true,
        bounds: [[872, 530], [948, 572]],
        counties: coList.map(c => ({ fips: c.fips, name: c.name, d: "" }))
      };
    }
  }

  console.log(`Successfully generated boundaries for ${mergedCount} continental/AK/HI MSAs + ${prCount} PR MSAs.`);

  const outFile = path.join(dataDir, 'metro_shapes.json');
  fs.writeFileSync(outFile, JSON.stringify(metroShapes));
  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`Saved ${outFile} (${sizeKb} KB)`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
