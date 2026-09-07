"""Build data/place_index.json — a city-name -> OEWS metro area crosswalk.

Lets the area search resolve a sub-city place (e.g. "Atascadero") to the
metropolitan area OEWS reports it under ("San Luis Obispo-Paso Robles, CA").

Source: a public US cities list (city, state, county) joined to this repo's
cbsa_to_counties.json by (state, county name), then filtered to the CBSAs
the OEWS manifest actually reports.

Output shape:
    { "<city-name-normalised>": [ ["<areaId>", "<ST>"], ... ], ... }
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request

CITIES_URL = "https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv"

STATE_FIPS_TO_ABBR = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY", "72": "PR",
}

COUNTY_SUFFIX_RE = re.compile(
    r"\s+(county|borough|parish|census area|city and borough|municipality|city)$"
)


def norm_county(name):
    n = (name or "").lower().strip()
    n = COUNTY_SUFFIX_RE.sub("", n)
    return re.sub(r"[^a-z0-9]+", "", n)


def norm_city(name):
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower().strip())


def load_cities(repo_root):
    local = os.path.join(repo_root, "bls_data", "us_cities.csv")
    tmp = "/tmp/us_cities.csv"
    for path in (local, tmp):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return list(csv.DictReader(f))
    print(f"Fetching {CITIES_URL}")
    raw = urllib.request.urlopen(CITIES_URL, timeout=30).read().decode("utf-8")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(raw)
    return list(csv.DictReader(io.StringIO(raw)))


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data_dir = os.path.join(repo_root, "data")

    with open(os.path.join(data_dir, "cbsa_to_counties.json"), encoding="utf-8") as f:
        cbsa_to_counties = json.load(f)
    with open(os.path.join(data_dir, "2025", "areas.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    reported = {a["id"] for a in manifest if a.get("type") == "msa"}

    # (ST, county-norm) -> areaId, keeping only CBSAs OEWS reports
    county_key_to_area = {}
    for cbsa_id, counties in cbsa_to_counties.items():
        if cbsa_id not in reported:
            continue
        for c in counties:
            fips = c.get("fips", "")
            st = STATE_FIPS_TO_ABBR.get(fips[:2])
            if not st:
                continue
            county_key_to_area[(st, norm_county(c.get("name")))] = cbsa_id

    cities = load_cities(repo_root)
    print(f"Loaded {len(cities)} cities, {len(county_key_to_area)} county keys.")

    index = {}
    hits = 0
    for row in cities:
        st = (row.get("STATE_CODE") or "").strip().upper()
        area = county_key_to_area.get((st, norm_county(row.get("COUNTY"))))
        if not area:
            continue
        key = norm_city(row.get("CITY"))
        if not key:
            continue
        entry = index.setdefault(key, [])
        pair = [area, st]
        if pair not in entry:
            entry.append(pair)
            hits += 1

    out_path = os.path.join(data_dir, "place_index.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), sort_keys=True)

    print(f"Wrote {out_path}: {len(index)} place names, {hits} place->area pairs.")
    # spot checks
    for probe in ("atascadero", "berkeley", "paloalto", "cambridge", "plano"):
        print(f"  {probe}: {index.get(probe)}")


if __name__ == "__main__":
    main()
