import os
import sys
import json
from collections import defaultdict

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    data_dir = os.path.join(repo_root, 'data')
    areas_dir = os.path.join(data_dir, 'areas')
    jobs_dir = os.path.join(data_dir, 'jobs')
    os.makedirs(jobs_dir, exist_ok=True)

    print("Building Complete Statistical Areas Map Data (MSAs + Non-Metro)...")

    # 1. Load areas manifest
    manifest_path = os.path.join(data_dir, 'areas.json')
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    manifest_by_id = {a['id']: a for a in manifest}

    # 2. Load metro_shapes.json
    shapes_path = os.path.join(data_dir, 'metro_shapes.json')
    with open(shapes_path, 'r', encoding='utf-8') as f:
        shapes = json.load(f)
    print(f"Loaded {len(shapes)} statistical area shapes.")

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

    # 4. Read each area's detailed JSON
    metro_list = []
    # job_soc -> { 'title': title, 'grp': grp, 'metros': { area_id: [emp, mean, median, p25, p75, lq] } }
    job_aggregates = defaultdict(lambda: {'title': '', 'grp': 0, 'metros': {}})

    for aid, shape in shapes.items():
        area_meta = manifest_by_id.get(aid, {})
        area_file = os.path.join(areas_dir, f"{aid}.json")
        if not os.path.exists(area_file):
            continue

        with open(area_file, 'r', encoding='utf-8') as f:
            a_data = json.load(f)

        total_stats = a_data.get('total', {})
        metro_list.append({
            'id': aid,
            'name': shape.get('name', area_meta.get('name', '')),
            'type': shape.get('type', area_meta.get('type', 'msa')),
            'state': shape.get('state', area_meta.get('state', '')),
            'stateFips': shape.get('stateFips', area_meta.get('stateFips', aid[:2])),
            'x': shape['cx'],
            'y': shape['cy'],
            'bounds': shape.get('bounds'),
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

            if median is not None or mean is not None or emp is not None:
                entry['metros'][aid] = [emp, mean, median, p25, p75, lq]

    print(f"Compiled stats for {len(metro_list)} statistical areas and {len(job_aggregates)} distinct occupations.")

    # 5. Save individual job files
    occupation_catalog = []
    occupation_catalog.append({
        'soc': '00-0000',
        'title': 'All Occupations (Cross-Industry Total)',
        'grp': -1,
        'count': len(metro_list)
    })

    saved_jobs = 0
    for soc, data in job_aggregates.items():
        area_count = len(data['metros'])
        if area_count >= 3:
            occupation_catalog.append({
                'soc': soc,
                'title': data['title'],
                'grp': data['grp'],
                'count': area_count
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

    # 6. Save master metro_map.json
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

    print(f"Saved {map_file} ({len(metro_list)} areas, {len(occupation_catalog)} selectable occupations).")
    print("Done!")

if __name__ == '__main__':
    main()
