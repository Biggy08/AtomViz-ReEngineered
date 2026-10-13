"""Independent standard-library RDF/coordination check against browser exports.

The 13.4-Angstrom cell is an explicit test assumption, not inferred metadata.
Run after npm run test:e2e. This is not validation against legacy AtomViz.
"""
import csv
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent.parent
rdf = json.loads((root / 'test-results/rdf.json').read_text(encoding='utf-8'))
params = rdf['parameters']
meta = rdf['metadata']
lines = (root / 'public/examples/mg32s32o92s4-reducedMelt').read_text().splitlines()
frames = []
for index, line in enumerate(lines):
    if line.startswith('Direct configuration='):
        frames.append([tuple(map(float, s.split())) for s in lines[index + 1:index + 161]])
assert meta['cell'] == [13.4, 13.4, 13.4]
assert params['first'] == 'Si' and params['second'] == 'O'
assert params['cutoff'] == 2 and params['bins'] == 80
counts = [0] * 80
distribution = {}
for frame in frames[params['start']:params['end'] + 1]:
    for atom in frame[32:64]:
        neighbors = 0
        for other in frame[64:156]:
            delta = [((a - b + .5) % 1 - .5) * 13.4 for a, b in zip(atom, other)]
            d = math.sqrt(sum(v * v for v in delta))
            if d < 2:
                counts[min(79, int(d / .025))] += 1
                neighbors += 1
        distribution[neighbors] = distribution.get(neighbors, 0) + 1
fcount = params['end'] - params['start'] + 1
cumulative = 0
for i, row in enumerate(rdf['rows']):
    cumulative += counts[i]
    shell = 4 * math.pi / 3 * (((i + 1) * .025) ** 3 - (i * .025) ** 3)
    expected = counts[i] * 13.4 ** 3 / (fcount * 32 * 92 * shell)
    assert math.isclose(row[1], expected, rel_tol=1e-10, abs_tol=1e-10), (i, row[1], expected)
    assert row[3] == counts[i]
    assert math.isclose(row[2], cumulative / (fcount * 32), rel_tol=1e-10, abs_tol=1e-10)
with (root / 'test-results/coordination.csv').open(encoding='utf-8') as f:
    rows = list(csv.reader(line for line in f if not line.startswith('#')))[1:]
for n, fraction, count in rows:
    assert int(float(count)) == distribution[int(float(n))]
    assert math.isclose(float(fraction), int(float(count)) / (fcount * 32), rel_tol=1e-10)
print(f'Independent Python reference matched all 80 RDF bins and {len(rows)} coordination categories across {fcount} frames.')
