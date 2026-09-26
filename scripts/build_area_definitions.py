"""Convert the BLS OEWS area definitions spreadsheet to JSON.

Input:  bls_data/area_definitions_m<year>.xlsx
        (https://www.bls.gov/oes/area_definitions_m<year>.xlsx, linked from
        https://www.bls.gov/oes/current/msa_def.htm; bls.gov refuses scripted
        downloads, so fetch it in a browser)
Output: data/area_definitions_<year>.json
        { "<5-digit county FIPS>": { "area": "<OEWS area code>", "name": "<county name>" } }

Used by build_all_statistical_areas.mjs to assign counties to MSAs and
nonmetropolitan areas. Standard library only.
"""
import json
import os
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
HEADER = ['FIPS Code', 'State', 'State Abbreviation', None, None, 'County Code', 'County Name']


def read_rows(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si'):
                shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
        sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        for row in sheet.iter(NS + 'row'):
            cells = {}
            for c in row.findall(NS + 'c'):
                col = ''.join(ch for ch in c.attrib['r'] if ch.isalpha())
                v = c.find(NS + 'v')
                kind = c.attrib.get('t')
                if kind == 's':
                    cells[col] = shared[int(v.text)]
                elif kind == 'inlineStr':
                    cells[col] = ''.join(t.text or '' for t in c.iter(NS + 't'))
                else:
                    cells[col] = v.text if v is not None else ''
            yield [cells.get(col, '') for col in 'ABCDEFG']


def main(year='2025'):
    year = str(year)
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    src = os.path.join(root, 'bls_data', f'area_definitions_m{year}.xlsx')
    out = os.path.join(root, 'data', f'area_definitions_{year}.json')

    rows = read_rows(src)
    header = next(rows)
    for expected, got in zip(HEADER, header):
        if expected and got.strip() != expected:
            sys.exit(f'Unexpected column {got!r} (expected {expected!r}) in {src}')

    counties = {}
    for st_fips, _state, _abbr, area, _title, county, name in rows:
        if not st_fips:
            continue
        fips = st_fips.zfill(2) + county.zfill(3)
        if fips in counties and counties[fips]['area'] != area:
            sys.exit(f'County {fips} is assigned to both {counties[fips]["area"]} and {area}')
        counties[fips] = {'area': area, 'name': name}

    with open(out, 'w', encoding='utf-8') as f:
        json.dump(counties, f, separators=(',', ':'), sort_keys=True)
    areas = {c['area'] for c in counties.values()}
    print(f'Wrote {out}: {len(counties)} counties in {len(areas)} areas.')


if __name__ == '__main__':
    main(*sys.argv[1:2])
