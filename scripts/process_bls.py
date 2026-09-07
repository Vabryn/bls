import os
import sys
import json
import zipfile
import re
import xml.etree.ElementTree as ET
from collections import defaultdict

SOC_MAJOR_GROUPS = [
    ("11", "Management"),
    ("13", "Business & Financial"),
    ("15", "Computer & Math"),
    ("17", "Architecture & Eng"),
    ("19", "Life & Social Science"),
    ("21", "Community & Social Svc"),
    ("23", "Legal"),
    ("25", "Education & Library"),
    ("27", "Arts, Design & Media"),
    ("29", "Healthcare Practitioners"),
    ("31", "Healthcare Support"),
    ("33", "Protective Service"),
    ("35", "Food Prep & Serving"),
    ("37", "Building & Grounds"),
    ("39", "Personal Care & Svc"),
    ("41", "Sales"),
    ("43", "Office & Admin Support"),
    ("45", "Farming & Fishing"),
    ("47", "Construction & Extraction"),
    ("49", "Installation & Repair"),
    ("51", "Production"),
    ("53", "Transportation & Moving"),
]
SOC_PREFIX_TO_GROUP_IDX = {code: i for i, (code, _) in enumerate(SOC_MAJOR_GROUPS)}

def normalize_title(s):
    s = s.lower().replace('/', ' and ').replace('&', ' and ')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return ' '.join(s.split())

def load_education_mapping(bls_html_path):
    existing = {}
    if os.path.exists(bls_html_path):
        with open(bls_html_path, 'r', encoding='utf-8') as f:
            html_text = f.read()
        for m in re.finditer(r"\[\'(.*?)\',\s*(\d+),\s*(\d+)", html_text):
            existing[normalize_title(m.group(1))] = int(m.group(3))
    return existing

def load_education_mapping_from_areas(areas_dir):
    """Seed the education map from an already-processed set of area JSON files.

    Each occupation row is [soc, title, grp_idx, edu_lvl, ...]. Using the
    committed 2025 output as the source keeps education classification
    identical across every year we process, regardless of what the current
    bls.html happens to contain."""
    existing = {}
    if not os.path.isdir(areas_dir):
        return existing
    for fn in os.listdir(areas_dir):
        if not fn.endswith('.json'):
            continue
        try:
            with open(os.path.join(areas_dir, fn), 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (ValueError, OSError):
            continue
        for row in data.get('occupations', []):
            if len(row) >= 4 and row[0] and row[3] is not None:
                existing.setdefault(normalize_title(row[1]), int(row[3]))
    return existing

def determine_edu_level(soc, title, existing_map):
    norm = normalize_title(title)
    if norm in existing_map:
        return existing_map[norm]
    for k, v in existing_map.items():
        if k in norm or norm in k:
            return v

    major = soc[:2]
    t = norm
    if major in ('11', '13', '15'):
        return 4
    if major == '17':
        return 3 if ('technician' in t or 'drafter' in t) else 4
    if major == '19':
        if 'technician' in t:
            return 3
        if any(x in t for x in ['physicist', 'astronomer', 'economist', 'psychologist']):
            return 6
        return 4
    if major == '21':
        if 'therapist' in t or 'counselor' in t or 'social worker' in t:
            return 5
        return 4
    if major == '23':
        if any(x in t for x in ['lawyer', 'judge', 'attorney', 'judicial']):
            return 6
        if 'paralegal' in t:
            return 3
        return 4
    if major == '25':
        if 'postsecondary' in t or 'professor' in t:
            return 6
        return 4
    if major == '27':
        return 4
    if major == '29':
        if any(x in t for x in ['physician', 'surgeon', 'dentist', 'veterinarian', 'pharmacist', 'optometrist', 'audiologist', 'podiatrist', 'anesthesiologist']):
            return 6
        if 'practitioner' in t or 'physician assistant' in t:
            return 5
        if any(x in t for x in ['technologist', 'technician', 'hygienist']):
            return 3
        return 4
    if major == '31':
        return 2
    if major == '33':
        return 1
    if major in ('35', '37', '45'):
        return 0
    if major == '39':
        if any(x in t for x in ['skincare', 'hair', 'massage', 'barber', 'cosmetology']):
            return 2
        return 1
    if major in ('41', '43'):
        return 1
    if major in ('47', '49'):
        if any(x in t for x in ['electrician', 'plumber', 'hvac', 'mechanic', 'repairer', 'technician']):
            return 2
        return 1
    if major in ('51', '53'):
        return 1
    return 1

def parse_num(v, default=None):
    if not v:
        return default
    v = v.strip().replace(',', '')
    if v == '#' or v == '#.0' or v == '#.00':
        return 239200
    if v in ('*', '**', '-', 'N/A', 'NA', ''):
        return default
    try:
        if '.' in v:
            f = float(v)
            return round(f, 2)
        return int(v)
    except ValueError:
        return default

# Annual estimate from an OES hourly cell. BLS suppresses annual wages ('*')
# for occupations whose workers typically don't work year-round full time
# (actors, dancers, musicians, athletes...), but still publishes hourly ones.
# The standard OES annualisation is hourly x 2080 (40h x 52w); '#' is the
# hourly top code ($115.00/hr).
HOURS_PER_YEAR = 2080

def hourly_to_annual(v, default=None):
    if not v:
        return default
    v = v.strip().replace(',', '')
    if v in ('#', '#.0', '#.00'):
        return 115.0 * HOURS_PER_YEAR
    if v in ('*', '**', '-', 'N/A', 'NA', ''):
        return default
    try:
        return round(float(v) * HOURS_PER_YEAR)
    except ValueError:
        return default

def main(year='2025'):
    year = str(year)
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    bls_data_file = os.path.abspath(os.path.join(repo_root, 'bls_data', f'all_data_M_{year}.xlsx'))
    out_dir = os.path.join(repo_root, 'data', year)
    areas_dir = os.path.join(out_dir, 'areas')
    os.makedirs(areas_dir, exist_ok=True)

    print(f"Reading from: {bls_data_file}")
    print(f"Output to: {areas_dir}")

    # Load existing education mapping. Prefer the committed 2025 area output so
    # that every year is classified identically; fall back to bls.html.
    ref_areas_dir = os.path.join(repo_root, 'data', '2025', 'areas')
    edu_map = load_education_mapping_from_areas(ref_areas_dir)
    if edu_map:
        print(f"Loaded {len(edu_map)} education mappings from {ref_areas_dir}.")
    else:
        edu_map = load_education_mapping(os.path.join(repo_root, 'bls.html'))
        print(f"Loaded {len(edu_map)} occupation education mappings from bls.html.")

    with zipfile.ZipFile(bls_data_file) as z:
        # Load shared strings
        shared_strings = []
        print("Loading shared strings...")
        with z.open('xl/sharedStrings.xml') as f:
            for event, elem in ET.iterparse(f, events=('end',)):
                if elem.tag.endswith('}si'):
                    t_elements = elem.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    shared_strings.append(''.join(t.text or '' for t in t_elements))
                    elem.clear()
        print(f"Shared strings loaded: {len(shared_strings)}")

        # Store area summaries and detailed rows
        # area_id -> metadata
        area_meta = {}
        # area_id -> list of detailed rows: [soc, title, grp_idx, edu_lvl, emp, mean, median, p10, p25, p75, p90, lq]
        area_occs = defaultdict(list)
        # area_id -> list of major group summaries
        area_majors = defaultdict(list)

        print("Parsing sheet1.xml (cross-industry records)...")
        row_idx = 0
        with z.open('xl/worksheets/sheet1.xml') as f:
            for event, elem in ET.iterparse(f, events=('end',)):
                if elem.tag.endswith('}row'):
                    row_idx += 1
                    if row_idx == 1:
                        elem.clear()
                        continue

                    cells = {}
                    for c in elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                        r = c.attrib.get('r')
                        col = ''.join([ch for ch in r if ch.isalpha()])
                        val = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        t = c.attrib.get('t')
                        v = shared_strings[int(val.text)] if (val is not None and val.text and t == 's') else (val.text if val is not None else '')
                        cells[col] = v

                    # Filter cross-industry NAICS '000000'
                    if cells.get('E') == '000000':
                        area_id = cells.get('A')
                        area_type = cells.get('C') # 1=Nat, 2=State, 3=Territory, 4=MSA, 6=Non-metro
                        ogrp = cells.get('K') # total, major, detailed

                        if area_type in ('1', '2', '3', '4', '6'):
                            name_val = cells.get('B')
                            if area_id == '99':
                                name_val = 'United States (National)'
                            if area_id not in area_meta:
                                type_name = {
                                    '1': 'national',
                                    '2': 'state',
                                    '3': 'territory',
                                    '4': 'msa',
                                    '6': 'nonmetro'
                                }.get(area_type, 'other')
                                area_meta[area_id] = {
                                    'id': area_id,
                                    'name': name_val,
                                    'type': type_name,
                                    'state': cells.get('D'),
                                    'emp': None,
                                    'mean': None,
                                    'median': None,
                                    'p10': None,
                                    'p25': None,
                                    'p75': None,
                                    'p90': None,
                                }

                            if ogrp == 'total':
                                area_meta[area_id]['emp'] = parse_num(cells.get('L'))
                                area_meta[area_id]['mean'] = parse_num(cells.get('S'))
                                area_meta[area_id]['median'] = parse_num(cells.get('AB'))
                                area_meta[area_id]['p10'] = parse_num(cells.get('Z'))
                                area_meta[area_id]['p25'] = parse_num(cells.get('AA'))
                                area_meta[area_id]['p75'] = parse_num(cells.get('AC'))
                                area_meta[area_id]['p90'] = parse_num(cells.get('AD'))

                            elif ogrp == 'major':
                                soc = cells.get('I', '')
                                title = cells.get('J', '')
                                emp = parse_num(cells.get('L'))
                                mean = parse_num(cells.get('S'))
                                median = parse_num(cells.get('AB'))
                                area_majors[area_id].append({
                                    'soc': soc,
                                    'title': title,
                                    'emp': emp,
                                    'mean': mean,
                                    'median': median
                                })

                            elif ogrp == 'detailed':
                                soc = cells.get('I', '')
                                title = cells.get('J', '')
                                grp_idx = SOC_PREFIX_TO_GROUP_IDX.get(soc[:2], 0)
                                edu_lvl = determine_edu_level(soc, title, edu_map)
                                emp = parse_num(cells.get('L'))
                                mean = parse_num(cells.get('S'))
                                median = parse_num(cells.get('AB'))
                                p10 = parse_num(cells.get('Z'))
                                p25 = parse_num(cells.get('AA'))
                                p75 = parse_num(cells.get('AC'))
                                p90 = parse_num(cells.get('AD'))
                                lq = parse_num(cells.get('O'), 1.0 if area_id == '99' else None)

                                # If BLS withheld the annual wage but published an
                                # hourly one, annualise it (hourly x 2080) and mark
                                # the row so the UI can label it. R=H_MEAN, W=H_MEDIAN,
                                # U/V/X/Y = H_PCT10/25/75/90.
                                hourly_flag = 0
                                if mean is None and median is None:
                                    h_mean = hourly_to_annual(cells.get('R'))
                                    h_median = hourly_to_annual(cells.get('W'))
                                    if h_mean is not None or h_median is not None:
                                        hourly_flag = 1
                                        mean = h_mean
                                        median = h_median
                                        p10 = hourly_to_annual(cells.get('U'))
                                        p25 = hourly_to_annual(cells.get('V'))
                                        p75 = hourly_to_annual(cells.get('X'))
                                        p90 = hourly_to_annual(cells.get('Y'))

                                # Only include if we have at least median wage or mean wage or employment
                                if median is not None or mean is not None or emp is not None:
                                    row = [
                                        soc,
                                        title,
                                        grp_idx,
                                        edu_lvl,
                                        emp,
                                        mean,
                                        median,
                                        p10,
                                        p25,
                                        p75,
                                        p90,
                                        lq
                                    ]
                                    if hourly_flag:
                                        row.append(1)   # row[12] = annualised-from-hourly
                                    area_occs[area_id].append(row)

                    elem.clear()

        print(f"Finished parsing sheet1. Found {len(area_meta)} areas.")

        # Build manifest
        manifest = []
        for aid, meta in area_meta.items():
            occs = area_occs.get(aid, [])
            # Update occ count
            manifest.append({
                'id': aid,
                'name': meta['name'],
                'type': meta['type'],
                'state': meta['state'],
                'emp': meta['emp'],
                'mean': meta['mean'],
                'median': meta['median'],
                'count': len(occs)
            })

            # Save individual area JSON
            area_data = {
                'id': aid,
                'name': meta['name'],
                'type': meta['type'],
                'state': meta['state'],
                'total': {
                    'emp': meta['emp'],
                    'mean': meta['mean'],
                    'median': meta['median'],
                    'p10': meta['p10'],
                    'p25': meta['p25'],
                    'p75': meta['p75'],
                    'p90': meta['p90'],
                },
                'majors': area_majors.get(aid, []),
                'occupations': occs
            }
            out_file = os.path.join(areas_dir, f"{aid}.json")
            with open(out_file, 'w', encoding='utf-8') as out_f:
                json.dump(area_data, out_f, separators=(',', ':'))

        # Sort manifest: National first, then States alphabetically, then MSAs alphabetically, then Non-metro
        type_priority = {'national': 0, 'state': 1, 'territory': 2, 'msa': 3, 'nonmetro': 4}
        manifest.sort(key=lambda x: (type_priority.get(x['type'], 99), x['name']))

        manifest_path = os.path.join(out_dir, 'areas.json')
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, separators=(',', ':'))

        print(f"Generated {manifest_path} with {len(manifest)} areas.")
        print(f"Individual area files written to {areas_dir}")

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '2025')
