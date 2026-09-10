"""Validate committed wage records without turning censored bounds into estimates."""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = list((root / 'data').glob('20*/areas/*.json'))
assert files, 'No annual area records found'
count = 0
for file in files:
    data = json.loads(file.read_text())
    assert str(data['id']) == file.stem, file
    for row in data['occupations']:
        count += 1
        assert len(row) >= 12, (file, row[0])
        assert all(v is None or isinstance(v, (int, float)) and math.isfinite(v) and v >= 0 for v in row[4:12]), (file, row[0])
        # 239200 represents a lower bound, not an exact percentile. Exclude it
        # from ordering exact observations; never replace the published value.
        exact = [row[i] for i in (7, 8, 6, 9, 10) if row[i] and row[i] != 239200]
        assert exact == sorted(exact), (file, row[0], exact)
print(f'PASS {len(files)} area files / {count} occupation records: numeric values and uncensored percentile ordering')
