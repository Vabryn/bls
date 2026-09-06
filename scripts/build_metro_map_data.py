import os
import sys
import json
import subprocess
from collections import defaultdict

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    data_dir = os.path.join(repo_root, 'data')
    areas_dir = os.path.join(data_dir, 'areas')
    jobs_dir = os.path.join(data_dir, 'jobs')
    os.makedirs(jobs_dir, exist_ok=True)

    print("Building Metro-Specified USA Map Data...")

    # 1. Load areas manifest
    manifest_path = os.path.join(data_dir, 'areas.json')
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    # 2. Load Census CBSA coordinates
    cbsa_path = os.path.join(data_dir, 'cbsa_coords.json')
    with open(cbsa_path, 'r', encoding='utf-8') as f:
        cbsa_coords = json.load(f)

    # 3. Load National area for baseline stats
    nat_path = os.path.join(areas_dir, '99.json')
    with open(nat_path, 'r', encoding='utf-8') as f:
        nat_data = json.load(f)

    nat_occ_map = {}
    for row in nat_data.get('occupations', []):
        soc, title, grp_idx, edu_lvl, emp, mean, median, p10, p25, p75, p90, lq = row
        nat_occ_map[soc] = {
            'emp': emp,
            'mean': mean,
            'median': median,
            'p25': p25,
            'p75': p75,
            'p10': p10,
            'p90': p90
        }

    # 4. Filter for 393 MSAs
    msas = [a for a in manifest if a.get('type') == 'msa']
    print(f"Total MSAs to process: {len(msas)}")

    # Use node to run d3.geoAlbersUsa for high precision
    # Output projected [x, y] for all MSAs
    node_script = """
    import * as d3 from 'd3-geo';
    import fs from 'fs';

    const proj = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
    const manifest = JSON.parse(fs.readFileSync('data/areas.json', 'utf8'));
    const coords = JSON.parse(fs.readFileSync('data/cbsa_coords.json', 'utf8'));

    const msas = manifest.filter(a => a.type === 'msa');
    const mapping = {};

    for (const m of msas) {
      const c = coords[m.id];
      if (c) {
        const pt = proj([c.lon, c.lat]);
        if (pt) {
          mapping[m.id] = {
            x: Math.round(pt[0] * 10) / 10,
            y: Math.round(pt[1] * 10) / 10,
            lat: c.lat,
            lon: c.lon
          };
        } else if (m.state === 'PR') {
          // Puerto Rico Inset: box [870..945, 535..575]
          const x = 880 + (c.lon - (-67.2)) * 32;
          const y = 565 - (c.lat - 17.9) * 32;
          mapping[m.id] = {
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            lat: c.lat,
            lon: c.lon,
            is_inset: true
          };
        }
      }
    }
    fs.writeFileSync('data/metro_proj_temp.json', JSON.stringify(mapping));
    """

    subprocess.run(['node', '--input-type=module', '-e', node_script], cwd=repo_root, check=True)

    with open(os.path.join(data_dir, 'metro_proj_temp.json'), 'r') as f:
        proj_coords = json.load(f)
    os.remove(os.path.join(data_dir, 'metro_proj_temp.json'))

    print(f"Projected coordinates generated for {len(proj_coords)} MSAs.")

    # 5. Read each MSA's detailed area JSON
    metro_list = []
    # job_soc -> { 'title': title, 'grp': grp, 'metros': { msa_id: [emp, mean, median, p25, p75, lq] } }
    job_aggregates = defaultdict(lambda: {'title': '', 'grp': 0, 'metros': {}})

    for m in msas:
        aid = m['id']
        coords = proj_coords.get(aid)
        if not coords:
            print(f"Warning: missing projected coords for {aid} {m['name']}")
            continue

        area_file = os.path.join(areas_dir, f"{aid}.json")
        if not os.path.exists(area_file):
            continue

        with open(area_file, 'r', encoding='utf-8') as f:
            a_data = json.load(f)

        total_stats = a_data.get('total', {})
        metro_list.append({
            'id': aid,
            'name': m['name'],
            'state': m.get('state', ''),
            'x': coords['x'],
            'y': coords['y'],
            'lat': coords['lat'],
            'lon': coords['lon'],
            'is_inset': coords.get('is_inset', False),
            'emp': total_stats.get('emp'),
            'mean': total_stats.get('mean'),
            'median': total_stats.get('median'),
            'p25': total_stats.get('p25'),
            'p75': total_stats.get('p75'),
            'p10': total_stats.get('p10'),
            'p90': total_stats.get('p90')
        })

        for row in a_data.get('occupations', []):
            soc, title, grp_idx, edu_lvl, emp, mean, median, p10, p25, p75, p90, lq = row
            entry = job_aggregates[soc]
            if not entry['title']:
                entry['title'] = title
                entry['grp'] = grp_idx

            # Only include if at least median or mean or emp is present
            if median is not None or mean is not None or emp is not None:
                entry['metros'][aid] = [emp, mean, median, p25, p75, lq]

    print(f"Compiled stats for {len(metro_list)} metros and {len(job_aggregates)} distinct occupations.")

    # 6. Save individual job files
    occupation_catalog = []
    # Add 'All Occupations' entry
    occupation_catalog.append({
        'soc': '00-0000',
        'title': 'All Occupations (Cross-Industry Total)',
        'grp': -1,
        'count': len(metro_list)
    })

    saved_jobs = 0
    for soc, data in job_aggregates.items():
        metro_count = len(data['metros'])
        if metro_count >= 3: # Keep occupations present in at least 3 MSAs
            occupation_catalog.append({
                'soc': soc,
                'title': data['title'],
                'grp': data['grp'],
                'count': metro_count
            })

            job_payload = {
                'soc': soc,
                'title': data['title'],
                'grp': data['grp'],
                'nat': nat_occ_map.get(soc, {
                    'emp': None,
                    'mean': None,
                    'median': None,
                    'p25': None,
                    'p75': None
                }),
                'metros': data['metros']
            }

            job_file = os.path.join(jobs_dir, f"{soc}.json")
            with open(job_file, 'w', encoding='utf-8') as out_f:
                json.dump(job_payload, out_f, separators=(',', ':'))
            saved_jobs += 1

    print(f"Saved {saved_jobs} individual job JSON files to {jobs_dir}")

    # Sort catalog: 'All Occupations' first, then by title A-Z
    occupation_catalog.sort(key=lambda x: (0 if x['soc'] == '00-0000' else 1, x['title']))

    # 7. Save master metro_map.json
    master_map = {
        'nat': {
            'emp': nat_data.get('total', {}).get('emp'),
            'mean': nat_data.get('total', {}).get('mean'),
            'median': nat_data.get('total', {}).get('median'),
            'p25': nat_data.get('total', {}).get('p25'),
            'p75': nat_data.get('total', {}).get('p75'),
        },
        'metros': metro_list,
        'occupations': occupation_catalog
    }

    map_file = os.path.join(data_dir, 'metro_map.json')
    with open(map_file, 'w', encoding='utf-8') as out_f:
        json.dump(master_map, out_f, separators=(',', ':'))

    print(f"Saved {map_file} ({len(metro_list)} metros, {len(occupation_catalog)} selectable occupations).")
    print("Done!")

if __name__ == '__main__':
    main()
