import { getDisplayConfig, LAYER_DISPLAY_CONFIG } from '../config/layerLegendConfig';

// Water-balance fluxes (Rain, Snow, ET, …) all share the same display
// precision in LAYER_DISPLAY_CONFIG (Rain.decimals == 1), so use Rain as the
// canonical entry for hover formatting. Falls back to 2 if the entry is gone.
export const PIE_HOVER_DECIMALS = LAYER_DISPLAY_CONFIG.Rain?.decimals ?? 2;

// Maps the human-readable label rendered in the sunburst back to the canonical
// LAYER_DISPLAY_CONFIG key so each segment's tooltip can show that variable's
// own unit. Parent nodes (Basin / Inputs / Outputs) are not flux leaves and
// fall back to the aggregate-derived unit in unitFor().
export const LABEL_TO_CONFIG_KEY = {
  'Rain':               'Rain',
  'Snow':               'Snow',
  'Evapotranspiration': 'TotalET_WB',
  'Runoff':             'Runoff',
};

export const PALETTE = {
  basin: '#FFFFFF',
  inputs: '#72E0EE',
  outputs: '#E07C33'
};

export const shade = (hex, factor = 0.25, lighten = true) => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const t = lighten ? 255 : 0;
  const ch = (v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
  const rr = r + (t - r) * factor;
  const gg = g + (t - g) * factor;
  const bb = b + (t - b) * factor;
  return `#${ch(rr)}${ch(gg)}${ch(bb)}`;
};

export const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const pickDataset = (datasets, base) => {
  if (!datasets?.length) return null;
  const order = ['monthly_avg', 'monthly_mean', 'monthly_median', 'monthly'];
  for (const suf of order) {
    const name = `${base}${suf}`;
    const hit = datasets.find(d => d.column_name === name);
    if (hit) return hit;
  }
  return null;
};

export const buildSeries = (ds, dateRange) => {
  if (!ds?.data_points) return [];
  const factor = getDisplayConfig(ds.column_name)?.factor ?? 1;
  let arr = ds.data_points;
  if (dateRange?.startDate && dateRange?.endDate) {
    const s = new Date(dateRange.startDate);
    const e = new Date(dateRange.endDate);
    arr = arr.filter(p => {
      const d = new Date(p.date);
      return d >= s && d <= e;
    });
  }
  return arr
    .map(p => {
      const d = new Date(p.date);
      return { key: monthKey(d), y: d.getUTCFullYear(), m: d.getUTCMonth(), v: Number(p.value) * factor };
    })
    .filter(p => Number.isFinite(p.v));
};

export const alignOnCommonMonths = (seriesList, mode = 'intersect') => {
  const nonEmpty = seriesList.filter(s => s.length);
  if (!nonEmpty.length) return { keys: [], aligned: seriesList.map(() => []) };
  const sets = nonEmpty.map(s => new Set(s.map(p => p.key)));
  let targetKeys;
  if (mode === 'intersect') {
    targetKeys = sets.reduce((acc, s) => new Set([...acc].filter(k => s.has(k))));
  } else {
    targetKeys = sets.reduce((acc, s) => new Set([...acc, ...s]));
  }
  const keys = [...targetKeys].sort();
  const keyed = seriesList.map(s => {
    const map = new Map(s.map(p => [p.key, p]));
    return keys.map(k => {
      const y = Number(k.slice(0, 4));
      const m = Number(k.slice(5, 7)) - 1;
      const hit = map.get(k);
      return { key: k, y, m, v: hit ? hit.v : 0 };
    });
  });
  return { keys, aligned: keyed };
};

export const computeTopShares = (actuals, mode, alphaExp) => {
  const entries = Object.entries(actuals).filter(([, v]) => v > 0);
  if (!entries.length) return {};
  if (mode === 'actual') {
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    const o = {}; for (const [k, v] of entries) o[k] = v / sum; return o;
  }
  if (mode === 'equalTop') {
    const eq = 1 / entries.length;
    const o = {}; for (const [k] of entries) o[k] = eq; return o;
  }
  const ws = entries.map(([k, v]) => [k, Math.pow(v, alphaExp)]);
  const wsum = ws.reduce((s, [, w]) => s + w, 0);
  const o = {}; for (const [k, w] of ws) o[k] = w / (wsum || 1); return o;
};

export const scaleChildren = (children, parentViz, minShareAbs) => {
  const tot = children.reduce((s, c) => s + (c.value > 0 ? c.value : 0), 0);
  if (tot <= 0) return children.map(c => ({ ...c, viz: 0 }));
  let arr = children.map(c => ({ ...c, viz: parentViz * (c.value / tot) }));
  const minViz = parentViz * minShareAbs;
  let deficit = 0;
  for (const c of arr) {
    if (c.viz > 0 && c.viz < minViz) { deficit += (minViz - c.viz); c.viz = minViz; }
  }
  if (deficit > 0) {
    const donors = arr.filter(c => c.viz > minViz).sort((a, b) => b.viz - a.viz);
    for (const d of donors) {
      const can = d.viz - minViz;
      const take = Math.min(can, deficit);
      d.viz -= take; deficit -= take; if (deficit <= 0) break;
    }
  }
  const sumViz = arr.reduce((s, c) => s + c.viz, 0);
  if (sumViz > 0) {
    const k = parentViz / sumViz;
    arr = arr.map(c => ({ ...c, viz: c.viz * k }));
  }
  return arr;
};
