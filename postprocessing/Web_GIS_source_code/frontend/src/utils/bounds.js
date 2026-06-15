export function calcSubbasinsBBox(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const f of features || []) {
    const b = getFeatureBBox(f);
    if (!b) continue;
    if (b[0] < minX) minX = b[0];
    if (b[1] < minY) minY = b[1];
    if (b[2] > maxX) maxX = b[2];
    if (b[3] > maxY) maxY = b[3];
  }

  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

export function bboxEquals(a, b, eps = 1e-9) {
  if (!a || !b) return a === b;
  return Math.abs(a[0] - b[0]) < eps
    && Math.abs(a[1] - b[1]) < eps
    && Math.abs(a[2] - b[2]) < eps
    && Math.abs(a[3] - b[3]) < eps;
}

function getFeatureBBox(f) {
  const g = f?.geometry || f?.geom || f;
  if (!g) return null;
  if (Array.isArray(g) && g.length === 4) return g;
  const coords = extractCoords(g);
  if (!coords.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return [minX, minY, maxX, maxY];
}

function extractCoords(geom) {
  const t = geom?.type;
  const c = geom?.coordinates;
  if (!t || !c) return [];

  if (t === 'Point') return [c];
  if (t === 'MultiPoint' || t === 'LineString') return c;
  if (t === 'MultiLineString' || t === 'Polygon') return c.flat();
  if (t === 'MultiPolygon') return c.flat(2);

  return [];
}

