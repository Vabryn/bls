import * as d3 from 'd3-geo';
import * as topojson from 'topojson-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

// Directional weighting for non-metro area names
function getDirectionWeights(name) {
  const lower = name.toLowerCase();
  let u = 0.5, v = 0.5; // u: West(0)->East(1), v: North(0)->South(1)

  const isNorth = lower.includes('north') || lower.includes('upper') || lower.includes('northern');
  const isSouth = lower.includes('south') || lower.includes('lower') || lower.includes('southern');
  const isWest = lower.includes('west') || lower.includes('western') || lower.includes('coast');
  const isEast = lower.includes('east') || lower.includes('eastern');
  const isCentral = lower.includes('central') || lower.includes('middle') || lower.includes('piedmont');

  if (isNorth && isWest) { u = 0.2; v = 0.2; }
  else if (isNorth && isEast) { u = 0.8; v = 0.2; }
  else if (isSouth && isWest) { u = 0.2; v = 0.8; }
  else if (isSouth && isEast) { u = 0.8; v = 0.8; }
  else if (isNorth) { u = 0.5; v = 0.2; }
  else if (isSouth) { u = 0.5; v = 0.8; }
  else if (isWest) { u = 0.2; v = 0.5; }
  else if (isEast) { u = 0.8; v = 0.5; }
  else if (isCentral) { u = 0.5; v = 0.5; }

  // Specific regional landmarks
  if (lower.includes('hill country')) { u = 0.45; v = 0.65; }
  if (lower.includes('border region')) { u = 0.35; v = 0.85; }
  if (lower.includes('coastal plains')) { u = 0.7; v = 0.75; }
  if (lower.includes('mother lode') || lower.includes('sierra')) { u = 0.6; v = 0.6; }
  if (lower.includes('valley')) { u = 0.4; v = 0.4; }

  return { u, v };
}

async function main() {
  console.log("Building complete statistical areas (MSAs + Non-Metro Areas)...");

  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'areas.json'), 'utf8'));
  const msas = manifest.filter(a => a.type === 'msa');
  const nonmetros = manifest.filter(a => a.type === 'nonmetro');
  const cbsaCounties = JSON.parse(fs.readFileSync(path.join(dataDir, 'cbsa_to_counties.json'), 'utf8'));

  const us = JSON.parse(fs.readFileSync(path.join(dataDir, 'counties-albers-10m.json'), 'utf8'));
  console.log(`Loaded US Atlas with ${us.objects.counties.geometries.length} counties.`);

  const pathGen = d3.geoPath();

  // Map county FIPS -> geometry & centroid
  const countyGeomMap = new Map();
  const countyCentroidMap = new Map();
  const allMsaFips = new Set();

  Object.values(cbsaCounties).forEach(list => {
    list.forEach(c => allMsaFips.add(c.fips));
  });

  us.objects.counties.geometries.forEach(g => {
    const fips = String(g.id).padStart(5, '0');
    countyGeomMap.set(fips, g);
    const feat = topojson.feature(us, g);
    const bounds = pathGen.bounds(feat);
    const cx = (bounds[0][0] + bounds[1][0]) / 2;
    const cy = (bounds[0][1] + bounds[1][1]) / 2;
    countyCentroidMap.set(fips, { cx, cy, bounds });
  });

  const allShapes = {};
  let totalBuilt = 0;

  // 1. Process 393 MSAs
  console.log(`Processing ${msas.length} MSAs...`);
  for (const m of msas) {
    const coList = cbsaCounties[m.id] || [];
    const geoms = [];
    coList.forEach(c => {
      const g = countyGeomMap.get(c.fips);
      if (g) geoms.push(g);
    });

    if (geoms.length > 0) {
      try {
        const merged = topojson.merge(us, geoms);
        const d = pathGen(merged);
        const bounds = pathGen.bounds(merged);
        const cx = Math.round(((bounds[0][0] + bounds[1][0]) / 2) * 10) / 10;
        const cy = Math.round(((bounds[0][1] + bounds[1][1]) / 2) * 10) / 10;

        const countyFeatures = geoms.map(g => {
          const fips = String(g.id).padStart(5, '0');
          const feature = topojson.feature(us, g);
          const found = coList.find(c => c.fips === fips);
          return {
            fips,
            name: found ? found.name : `County ${fips}`,
            d: pathGen(feature)
          };
        });

        allShapes[m.id] = {
          id: m.id,
          name: m.name,
          type: 'msa',
          state: m.state,
          stateFips: m.stateFips || m.id.substring(0, 2),
          d,
          bounds: [
            [Math.round(bounds[0][0]), Math.round(bounds[0][1])],
            [Math.round(bounds[1][0]), Math.round(bounds[1][1])]
          ],
          cx,
          cy,
          counties: countyFeatures
        };
        totalBuilt++;
      } catch (err) {
        console.error(`Error merging MSA ${m.id} ${m.name}:`, err);
      }
    }
  }

  // 2. Process Non-Metropolitan Areas by State
  console.log(`Processing ${nonmetros.length} Non-Metro Areas...`);
  const nonmetrosByState = {};
  nonmetros.forEach(nm => {
    const st = nm.state;
    nonmetrosByState[st] = nonmetrosByState[st] || [];
    nonmetrosByState[st].push(nm);
  });

  // Group all non-MSA counties by state FIPS
  const nonMsaCountiesByStateFips = {};
  for (const [fips, g] of countyGeomMap.entries()) {
    if (!allMsaFips.has(fips)) {
      const stFips = fips.substring(0, 2);
      nonMsaCountiesByStateFips[stFips] = nonMsaCountiesByStateFips[stFips] || [];
      nonMsaCountiesByStateFips[stFips].push(fips);
    }
  }

  // State abbreviation to state FIPS
  const stateFipsToAbbr = {};
  const stateAbbrToFips = {};
  manifest.filter(a => a.type === 'state' || a.type === 'territory').forEach(s => {
    stateFipsToAbbr[s.id] = s.state;
    stateAbbrToFips[s.state] = s.id;
  });

  for (const [stAbbr, nmlist] of Object.entries(nonmetrosByState)) {
    const stFips = stateAbbrToFips[stAbbr] || (nmlist[0] && nmlist[0].id.substring(0, 2));
    const countyFipsList = nonMsaCountiesByStateFips[stFips] || [];

    if (countyFipsList.length === 0) {
      console.warn(`No non-MSA counties found for state ${stAbbr} (${stFips})`);
      continue;
    }

    if (nmlist.length === 1) {
      // All non-MSA counties go to this single area
      const nm = nmlist[0];
      const geoms = countyFipsList.map(f => countyGeomMap.get(f)).filter(Boolean);
      try {
        const merged = topojson.merge(us, geoms);
        const d = pathGen(merged);
        const bounds = pathGen.bounds(merged);
        const cx = Math.round(((bounds[0][0] + bounds[1][0]) / 2) * 10) / 10;
        const cy = Math.round(((bounds[0][1] + bounds[1][1]) / 2) * 10) / 10;

        const countyFeatures = geoms.map(g => {
          const fips = String(g.id).padStart(5, '0');
          const feature = topojson.feature(us, g);
          return {
            fips,
            name: `County ${fips}`,
            d: pathGen(feature)
          };
        });

        allShapes[nm.id] = {
          id: nm.id,
          name: nm.name,
          type: 'nonmetro',
          state: stAbbr,
          stateFips: stFips,
          d,
          bounds: [
            [Math.round(bounds[0][0]), Math.round(bounds[0][1])],
            [Math.round(bounds[1][0]), Math.round(bounds[1][1])]
          ],
          cx,
          cy,
          counties: countyFeatures
        };
        totalBuilt++;
      } catch (err) {
        console.error(`Error merging single nonmetro ${nm.id}:`, err);
      }
    } else {
      // Multiple nonmetros: calculate bounding box of all nonmetro counties in this state
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      countyFipsList.forEach(f => {
        const c = countyCentroidMap.get(f);
        if (c) {
          if (c.cx < minX) minX = c.cx;
          if (c.cx > maxX) maxX = c.cx;
          if (c.cy < minY) minY = c.cy;
          if (c.cy > maxY) maxY = c.cy;
        }
      });
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);

      // Determine target (u, v) for each nonmetro area
      const areaTargets = nmlist.map(nm => {
        const { u, v } = getDirectionWeights(nm.name);
        return {
          nm,
          targetX: minX + u * spanX,
          targetY: minY + v * spanY,
          assignedCounties: []
        };
      });

      // Assign each county to closest area target
      countyFipsList.forEach(f => {
        const c = countyCentroidMap.get(f);
        if (!c) return;
        let bestDist = Infinity;
        let bestArea = areaTargets[0];
        areaTargets.forEach(at => {
          const dx = c.cx - at.targetX;
          const dy = c.cy - at.targetY;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestArea = at;
          }
        });
        bestArea.assignedCounties.push(f);
      });

      // Now build each nonmetro area shape
      areaTargets.forEach(at => {
        const geoms = at.assignedCounties.map(f => countyGeomMap.get(f)).filter(Boolean);
        if (geoms.length === 0) return;
        try {
          const merged = topojson.merge(us, geoms);
          const d = pathGen(merged);
          const bounds = pathGen.bounds(merged);
          const cx = Math.round(((bounds[0][0] + bounds[1][0]) / 2) * 10) / 10;
          const cy = Math.round(((bounds[0][1] + bounds[1][1]) / 2) * 10) / 10;

          const countyFeatures = geoms.map(g => {
            const fips = String(g.id).padStart(5, '0');
            const feature = topojson.feature(us, g);
            return {
              fips,
              name: `County ${fips}`,
              d: pathGen(feature)
            };
          });

          allShapes[at.nm.id] = {
            id: at.nm.id,
            name: at.nm.name,
            type: 'nonmetro',
            state: stAbbr,
            stateFips: stFips,
            d,
            bounds: [
              [Math.round(bounds[0][0]), Math.round(bounds[0][1])],
              [Math.round(bounds[1][0]), Math.round(bounds[1][1])]
            ],
            cx,
            cy,
            counties: countyFeatures
          };
          totalBuilt++;
        } catch (err) {
          console.error(`Error merging nonmetro ${at.nm.id}:`, err);
        }
      });
    }
  }

  console.log(`Successfully built ${totalBuilt} total statistical area shapes.`);

  const outPath = path.join(dataDir, 'metro_shapes.json');
  fs.writeFileSync(outPath, JSON.stringify(allShapes));
  const stats = fs.statSync(outPath);
  console.log(`Saved ${outPath} (${Math.round(stats.size / 1024)} KB).`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
