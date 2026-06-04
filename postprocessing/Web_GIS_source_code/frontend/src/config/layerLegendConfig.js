/**
 * Layer legend configuration with simplified ranges and correct display units.
 *
 * COG raster data is stored in meters for most variables. The legend displays
 * values converted to millimeters (x1000) with the unit "mm/month".
 * Colors are picked from the backend TiTiler colormaps so the legend matches
 * the rendered map tiles exactly.
 */

// -- Snow (data in meters, display in mm/month, max ~48 mm) --
// Backend colormap: snow.txt (0 -> 0.047908474 m)
const snowRanges = [
  { from: 0,  to: 0.5,  color: '#edf3ff' }, // 0.0000119771 m -> rgb(237,243,255)
  { from: 0.5, to: 2,   color: '#558bf7' }, // 0.000479085 m -> rgb(85,139,247)
  { from: 2,  to: 6,    color: '#1d4db1' }, // 0.002395424 m -> rgb(29,77,177)
  { from: 6,  to: 18,   color: '#071e55' }, // 0.008383983 m -> rgb(7,30,85)
  { from: 18, to: 36,   color: '#030e2b' }, // 0.023954237 m -> rgb(3,14,43)
  { from: 36, to: null, color: '#000612' }, // 0.047908474 m -> rgb(0,6,18)
];

// -- SnowMelt (data in meters, display in mm/month, max ~47 mm) --
// Backend colormap: snowmelt.txt (0 -> 0.046817083 m)
const snowMeltRanges = [
  { from: 0,  to: 0.5,  color: '#eaf3ff' }, // 0.0000117043 m -> rgb(234,243,255)
  { from: 0.5, to: 2,   color: '#7c96d6' }, // 0.000468171 m -> rgb(124,150,214)
  { from: 2,  to: 6,    color: '#4a479f' }, // 0.002340854 m -> rgb(67,55,147)  (adjusted to closest: 74,71,159)
  { from: 6,  to: 18,   color: '#1d063f' }, // 0.011704271 m -> rgb(29,6,63)
  { from: 18, to: 47,   color: '#0c0318' }, // 0.035112812 m -> rgb(12,3,24)
  { from: 47, to: null, color: '#07020f' }, // 0.046817083 m -> rgb(7,2,15)
];

// -- IceMelt (data in meters, display in mm/month, max ~60 mm) --
// Backend colormap: icemelt.txt (0 -> 0.06 m)
const iceMeltRanges = [
  { from: 0,  to: 0.5,  color: '#eaf5ff' }, // 0.0001 m -> rgb(234,245,255)
  { from: 0.5, to: 2,   color: '#a2cdfa' }, // 0.0016 m -> rgb(162,205,250)
  { from: 2,  to: 5,    color: '#5aa0e6' }, // 0.005 m -> rgb(90,160,230)
  { from: 5,  to: 15,   color: '#2775c4' }, // 0.0125 m -> rgb(39,117,196)
  { from: 15, to: 30,   color: '#0e488c' }, // 0.03 m -> rgb(14,72,140)
  { from: 30, to: 60,   color: '#052d5b' }, // 0.05 m -> rgb(5,45,91)
  { from: 60, to: null, color: '#032344' }, // 0.06 m -> rgb(3,35,68)
];

// -- ETRef (data in meters, display in mm/month, max ~9 mm) --
// Backend colormap: etref.txt (0 -> 0.009 m)
const etrefRanges = [
  { from: 0,  to: 0.5,  color: '#fff3af' }, // 0.0002 m -> rgb(255,243,175)
  { from: 0.5, to: 1,   color: '#feb24c' }, // 0.0009 m -> rgb(254,178,76)
  { from: 1,  to: 2,    color: '#fd8d3c' }, // 0.0015 m -> rgb(253,141,60)
  { from: 2,  to: 4,    color: '#e31a1c' }, // 0.004 m -> rgb(227,26,28)
  { from: 4,  to: 7,    color: '#bd0026' }, // 0.006 m -> rgb(189,0,38)
  { from: 7,  to: null, color: '#800026' }, // 0.009 m -> rgb(128,0,38)
];

// -- Rain (data in meters, display in mm/month, max ~60 mm) --
// Backend colormap: rain.txt (0 -> 0.06 m)
const rainRanges = [
  { from: 0,  to: 0.5,  color: '#e1f3c4' }, // 0.0003 m -> rgb(225,243,196)
  { from: 0.5, to: 2,   color: '#a5dbb5' }, // 0.0016 m -> rgb(165,219,181)
  { from: 2,  to: 5,    color: '#67c4be' }, // 0.005 m -> rgb(103,196,190)
  { from: 5,  to: 15,   color: '#3ca9c1' }, // 0.0125 m -> rgb(60,169,193)
  { from: 15, to: 30,   color: '#2c7cb7' }, // 0.03 m -> rgb(44,124,183)
  { from: 30, to: 60,   color: '#274ca0' }, // 0.05 m -> rgb(39,76,160)
  { from: 60, to: null, color: '#253494' }, // 0.06 m -> rgb(37,52,148)
];

// -- Runoff (data in meters, display in mm/month, max ~263 mm) --
// Backend colormap: runoff.txt (0 -> 0.262960136 m)
const runoffRanges = [
  { from: 0,   to: 1,    color: '#f7fcb9' }, // 0.00013148 m -> rgb(247,252,185)
  { from: 1,   to: 5,    color: '#c2e69b' }, // 0.001314801 m -> rgb(194,230,155)
  { from: 5,   to: 13,   color: '#7fc97a' }, // 0.005916603 m -> rgb(127,201,122)
  { from: 13,  to: 33,   color: '#50ad53' }, // 0.013148007 m -> rgb(80,173,83)
  { from: 33,  to: 100,  color: '#1f7f2d' }, // 0.046018024 m -> rgb(31,127,45)
  { from: 100, to: 263,  color: '#135f1b' }, // 0.131480068 m -> rgb(19,95,27)
  { from: 263, to: null, color: '#004529' }, // 0.262960136 m -> rgb(0,69,41)
];

// -- TotalET_WB (data in meters, display in mm/month, max ~2290 mm) --
// Backend colormap: totalet.txt (0 -> 2.290318966 m)
const totalETWBRanges = [
  { from: 0,    to: 6,    color: '#ffd975' }, // 0.001717739 m -> rgb(255,217,117)
  { from: 6,    to: 23,   color: '#ff9806' }, // 0.011451595 m -> rgb(255,152,6)
  { from: 23,   to: 69,   color: '#e65100' }, // 0.040080582 m -> rgb(230,81,0)
  { from: 69,   to: 172,  color: '#d84315' }, // 0.091612759 m -> rgb(216,67,21)
  { from: 172,  to: 573,  color: '#bd0026' }, // 0.229031897 m -> rgb(189,0,38)
  { from: 573,  to: 1718, color: '#990016' }, // 0.858869612 m -> rgb(153,0,26)
  { from: 1718, to: null, color: '#730022' }, // 2.290318966 m -> rgb(115,0,34)
];

// -- Discharge (already in m³/s, NO conversion needed, max ~20000) --
// Backend colormap: discharge.txt
const dischargeRanges = [
  { from: 0,     to: 50,    color: '#313695' }, // rgb(49,54,149)
  { from: 50,    to: 200,   color: '#abd9e9' }, // rgb(171,217,233)
  { from: 200,   to: 600,   color: '#ffffbf' }, // rgb(255,255,191)
  { from: 600,   to: 2000,  color: '#fdae61' }, // rgb(253,174,97)
  { from: 2000,  to: 7500,  color: '#d73027' }, // rgb(215,48,39)
  { from: 7500,  to: 20000, color: '#a80726' }, // rgb(168,7,38)
  { from: 20000, to: null,  color: '#a50026' }, // rgb(165,0,38)
];

// -- TWS (already in mm, NO conversion, divergent scale) --
// Backend colormap: tws.txt (-517.88 -> 505.39)
const twsRanges = [
  { from: -518, to: -200, color: '#67000d' }, // rgb(103,0,13)
  { from: -200, to: -50,  color: '#ef3b2c' }, // rgb(239,59,44)
  { from: -50,  to: 0,    color: '#fdd0c2' }, // rgb(253,208,194)
  { from: 0,    to: 50,   color: '#deebf7' }, // rgb(222,235,247)
  { from: 50,   to: 200,  color: '#4292c6' }, // rgb(66,146,198)
  { from: 200,  to: null, color: '#08306b' }, // rgb(8,48,107)
];

// -- SnowFraction (dimensionless, NO conversion, 0-1) --
// Backend colormap: snowfraction.txt
const snowFractionRanges = [
  { from: 0,    to: 0.01,  color: '#e6f5fb' }, // rgb(230,245,251)
  { from: 0.01, to: 0.05,  color: '#5fbedd' }, // rgb(95,190,221)
  { from: 0.05, to: 0.1,   color: '#15699f' }, // rgb(21,105,159)
  { from: 0.1,  to: 0.25,  color: '#0e497a' }, // rgb(14,73,122)
  { from: 0.25, to: 0.5,   color: '#072747' }, // rgb(7,39,71)
  { from: 0.5,  to: 1,     color: '#04182e' }, // rgb(4,24,46)
  { from: 1,    to: null,  color: '#031223' }, // rgb(3,18,35)
];

// -- DEM / Elevation (static, meters above sea level) --
// Backend colormap: dem.txt (classic hypsometric ramp). Each band is colored by
// the lower breakpoint, matching TiTiler's interval colormap. Negative values
// (min ~-10 m) are rare and share the lowland green.
const demRanges = [
  { from: 0,    to: 100,  color: '#267300' }, // rgb(38,115,0)    lowland (dark green)
  { from: 100,  to: 300,  color: '#4caf50' }, // rgb(76,175,80)   green
  { from: 300,  to: 600,  color: '#a8d08d' }, // rgb(168,208,141) pale green
  { from: 600,  to: 1000, color: '#e8d870' }, // rgb(232,216,112) yellow
  { from: 1000, to: 1500, color: '#c8a05a' }, // rgb(200,160,90)  tan
  { from: 1500, to: 2000, color: '#9c6b3c' }, // rgb(156,107,60)  brown
  { from: 2000, to: 3000, color: '#7a4b28' }, // rgb(122,75,40)   dark brown
  { from: 3000, to: null, color: '#b0a8a0' }, // rgb(176,168,160) high peaks (grey→white)
];

// -- LULC / Land Use - Land Cover (static, categorical, CGLS-LC100 2019) --
// Discrete integer class codes (NOT a continuous range). Colors match the
// official CGLS-LC100 v3 palette and the backend colormap (colormaps/lulc.txt),
// so the legend swatches equal the rendered tiles. This is the single source of
// truth for both the categorical legend and the hover code→name translation.
export const LULC_CLASSES = [
  { code: 20,  name: 'Shrubs',                                  color: '#ffbb22' },
  { code: 30,  name: 'Herbaceous vegetation',                   color: '#ffff4c' },
  { code: 40,  name: 'Cropland',                                color: '#f096ff' },
  { code: 50,  name: 'Urban / built-up',                        color: '#fa0000' },
  { code: 60,  name: 'Bare / sparse vegetation',               color: '#b4b4b4' },
  { code: 70,  name: 'Snow & ice',                              color: '#f0f0f0' },
  { code: 80,  name: 'Permanent water bodies',                  color: '#0032c8' },
  { code: 90,  name: 'Herbaceous wetland',                      color: '#0096a0' },
  { code: 100, name: 'Moss & lichen',                           color: '#fae6a0' },
  { code: 111, name: 'Closed forest – evergreen needle-leaved', color: '#58481f' },
  { code: 112, name: 'Closed forest – evergreen broad-leaved',  color: '#009900' },
  { code: 113, name: 'Closed forest – deciduous needle-leaved', color: '#70663e' },
  { code: 114, name: 'Closed forest – deciduous broad-leaved',  color: '#00cc00' },
  { code: 115, name: 'Closed forest – mixed',                   color: '#4e751f' },
  { code: 116, name: 'Closed forest – other',                   color: '#007800' },
  { code: 121, name: 'Open forest – evergreen needle-leaved',   color: '#666000' },
  { code: 122, name: 'Open forest – evergreen broad-leaved',    color: '#8db400' },
  { code: 123, name: 'Open forest – deciduous needle-leaved',   color: '#8d7400' },
  { code: 124, name: 'Open forest – deciduous broad-leaved',    color: '#a0dc00' },
  { code: 125, name: 'Open forest – mixed',                     color: '#929900' },
  { code: 126, name: 'Open forest – other',                     color: '#648c00' },
  { code: 200, name: 'Oceans / seas',                           color: '#000080' },
];

// Code → human-readable name, for the hover tool (resolves ANY class code, AC4).
export const LULC_CLASS_MAP = LULC_CLASSES.reduce((map, c) => {
  map[c.code] = c.name;
  return map;
}, {});

// Class codes actually present in the Danube basin (verified from the clipped
// COG histogram). The legend lists only these to stay concise while still
// covering every class drawn on the map (AC3).
const LULC_BASIN_CODES = new Set([20, 30, 40, 50, 60, 70, 80, 90, 100, 111, 114, 115, 116, 121, 124, 125, 126]);
const lulcCategories = LULC_CLASSES.filter((c) => LULC_BASIN_CODES.has(c.code));

/**
 * Display configuration for every CWatM variable shown in the app.
 *
 * This object is the single source of truth for units across the app: legend,
 * hover tooltip, chart axes, chart tooltips, pie chart and CSV exports all
 * read from here. Units align with the CWatM reference at
 * https://cwatm.iiasa.ac.at/61_variables.html — depth fluxes are stored in
 * meters per timestep and displayed in mm/month (×1000); discharge is m³/s;
 * state variables stored in meters are displayed in mm (×1000).
 *
 * TWS is the one exception: the backing data has already been converted to
 * millimeters before the frontend receives it, so factor stays 1.
 */
export const LAYER_DISPLAY_CONFIG = {
  Snow:          { label: 'Snow',                         factor: 1000, unit: 'mm/month', decimals: 1 },
  SnowMelt:      { label: 'Snow Melt',                    factor: 1000, unit: 'mm/month', decimals: 1 },
  IceMelt:       { label: 'Ice Melt',                     factor: 1000, unit: 'mm/month', decimals: 1 },
  ETRef:         { label: 'Reference Evapotranspiration', factor: 1000, unit: 'mm/month', decimals: 2 },
  Rain:          { label: 'Rain',                         factor: 1000, unit: 'mm/month', decimals: 1 },
  Runoff:        { label: 'Runoff',                       factor: 1000, unit: 'mm/month', decimals: 1 },
  TotalET_WB:    { label: 'Total ET (Water Bodies)',      factor: 1000, unit: 'mm/month', decimals: 0 },
  Discharge:     { label: 'Discharge',                    factor: 1,    unit: 'm³/s',     decimals: 2 },
  TWS:           { label: 'Total Water Storage',          factor: 1,    unit: 'mm',       decimals: 1 },
  SnowFraction:  { label: 'Snow Fraction',                factor: 1,    unit: '-',        decimals: 3 },
  // Static terrain layer (Copernicus DEM GLO-30), metres above sea level.
  DEM:           { label: 'Digital Elevation Model',      factor: 1,    unit: 'm',        decimals: 0 },
  // Static categorical layer (CGLS-LC100 2019). Value is a class code, not a
  // measured quantity, so it is rendered as a class name (no factor/unit).
  LULC:          { label: 'Land Use / Land Cover',        factor: 1,    unit: '',         decimals: 0 },
  // CWatM variables that the point graph can emit but that are not rendered
  // as raster layers. Native unit is meters (state or per-timestep flux),
  // converted ×1000 to millimeters for display.
  Precipitation: { label: 'Precipitation',                factor: 1000, unit: 'mm/month', decimals: 1 },
  GlacierMelt:   { label: 'Glacier Melt',                 factor: 1000, unit: 'mm/month', decimals: 1 },
  SoilMoisture:  { label: 'Soil Moisture',                factor: 1000, unit: 'mm',       decimals: 1 },
  SnowCover:     { label: 'Snow Cover',                   factor: 1000, unit: 'mm',       decimals: 1 },
};

/**
 * Legend item definitions for all raster layers.
 *
 * `name` and `unit` come from LAYER_DISPLAY_CONFIG so editing a unit in one
 * place updates the legend automatically. Everything that is legend-only —
 * the layer id, the color swatch and the bucketed color ranges — stays here.
 */
const legendItem = (id, metricKey, stateKey, color, category, ranges) => ({
  id,
  stateKey,
  color,
  category,
  ranges,
  name: LAYER_DISPLAY_CONFIG[metricKey].label,
  unit: LAYER_DISPLAY_CONFIG[metricKey].unit,
});

const LEGEND_ITEMS_CONFIG = [
  // Categorical land-cover legend: a list of discrete class swatches + names
  // (no value-range bar). `categories` flags it as categorical in Legend.js.
  {
    id: 'lulc',
    stateKey: 'isLulcVisible',
    category: 'land',
    color: '#40a000',
    categories: lulcCategories,
    name: LAYER_DISPLAY_CONFIG.LULC.label,
    unit: 'CGLS-LC100 2019',
  },
  legendItem('dem',           'DEM',          'isDemVisible',          '#4caf50', 'terrain', demRanges),
  legendItem('discharge',     'Discharge',    'isDischargeVisible',    '#FFA726', 'outputs', dischargeRanges),
  legendItem('etref',         'ETRef',        'isEtrefVisible',        '#42A5F5', 'inputs',  etrefRanges),
  legendItem('ice-melt',      'IceMelt',      'isIceMeltVisible',      '#90CAF9', 'inputs',  iceMeltRanges),
  legendItem('rain',          'Rain',         'isRainVisible',         '#1565C0', 'inputs',  rainRanges),
  legendItem('runoff',        'Runoff',       'isRunoffVisible',       '#FF9800', 'outputs', runoffRanges),
  legendItem('snow',          'Snow',         'isSnowVisible',         '#42A5F5', 'inputs',  snowRanges),
  legendItem('snow-fraction', 'SnowFraction', 'isSnowFractionVisible', '#82B1FF', 'inputs',  snowFractionRanges),
  legendItem('snow-melt',     'SnowMelt',     'isSnowMeltVisible',     '#2196F3', 'inputs',  snowMeltRanges),
  legendItem('total-et-wb',   'TotalET_WB',   'isTotalETWBVisible',    '#1E88E5', 'inputs',  totalETWBRanges),
  legendItem('tws',           'TWS',          'isTwsVisible',          '#FB8C00', 'outputs', twsRanges),
  // Surface-water vector layers (rivers/lakes) — not raster, so no value
  // ranges: rivers show a line sample, water bodies a fill swatch.
  {
    id: 'rivers',
    stateKey: 'isRiverNetworkVisible',
    category: 'water',
    type: 'line',
    color: '#1565C0',
    name: 'Rivers',
    unit: 'width = stream order',
  },
  {
    id: 'water-bodies',
    stateKey: 'isWaterBodiesVisible',
    category: 'water',
    type: 'swatch',
    color: 'rgba(33, 150, 243, 0.55)',
    name: 'Water Bodies',
    unit: 'lakes / reservoirs',
    note: 'HydroLAKES v1.0 — CC-BY 4.0',
  },
];

/**
 * Alias map from any identifier the UI might receive (NetCDF filename,
 * subbasin parquet column, point-graph variable name) to the canonical
 * metric key used in LAYER_DISPLAY_CONFIG. Lookup is case-insensitive.
 */
const METRIC_ALIASES = {
  // NetCDF file names
  'danube_discharge_monthly.nc':     'Discharge',
  'discharge_monthavg.nc':           'Discharge',
  'danube_runoff_monthly.nc':        'Runoff',
  'danube_tws_monthly.nc':           'TWS',
  'danube_rain_monthly.nc':          'Rain',
  'danube_snow_monthly.nc':          'Snow',
  'danube_snowfraction_monthly.nc':  'SnowFraction',
  'snowfraction_monthavg.nc':        'SnowFraction',
  'danube_snowmelt_monthly.nc':      'SnowMelt',
  'danube_icemelt_monthly.nc':       'IceMelt',
  'danube_totalet_wb_monthly.nc':    'TotalET_WB',
  'danube_etref_monthly.nc':         'ETRef',
  // Subbasin parquet column names
  'danube_discharge_monthly_avg':    'Discharge',
  'danube_discharge_monthly_sum':    'Discharge',
  'danube_runoff_monthly_avg':       'Runoff',
  'danube_runoff_monthly_sum':       'Runoff',
  'danube_tws_monthly_avg':          'TWS',
  'danube_tws_monthly_sum':          'TWS',
  'danube_rain_monthly_avg':         'Rain',
  'danube_rain_monthly_sum':         'Rain',
  'danube_snow_monthly_avg':         'Snow',
  'danube_snow_monthly_sum':         'Snow',
  'danube_snowfraction_monthly_avg': 'SnowFraction',
  'danube_snowfraction_monthly_sum': 'SnowFraction',
  'danube_snowmelt_monthly_avg':     'SnowMelt',
  'danube_snowmelt_monthly_sum':     'SnowMelt',
  'danube_icemelt_monthly_avg':      'IceMelt',
  'danube_icemelt_monthly_sum':      'IceMelt',
  'danube_totalet_wb_monthly_avg':   'TotalET_WB',
  'danube_totalet_wb_monthly_sum':   'TotalET_WB',
  'danube_etref_monthly_avg':        'ETRef',
  'danube_etref_monthly_sum':        'ETRef',
  // Static terrain layer
  'dem':            'DEM',
  'elevation':      'DEM',
  // Static categorical land-cover layer
  'lulc':           'LULC',
  'land cover':     'LULC',
  'landcover':      'LULC',
  // Point-graph variable names
  'discharge':      'Discharge',
  'runoff':         'Runoff',
  'tws':            'TWS',
  'rain':           'Rain',
  'snow':           'Snow',
  'snowfraction':   'SnowFraction',
  'snow fraction':  'SnowFraction',
  'snow melt':      'SnowMelt',
  'snowmelt':       'SnowMelt',
  'ice melt':       'IceMelt',
  'icemelt':        'IceMelt',
  'etref':          'ETRef',
  'totalet wb':     'TotalET_WB',
  'totalet_wb':     'TotalET_WB',
  // Aliases for variables that the point graph can emit but which are not
  // rendered as raster layers. Each form below has been observed coming
  // through getDatasetInfo() in PointGraph.js.
  'precipitation':  'Precipitation',
  'glacier melt':   'GlacierMelt',
  'glaciermelt':    'GlacierMelt',
  'soil moisture':  'SoilMoisture',
  'soilmoisture':   'SoilMoisture',
  'snow cover':     'SnowCover',
  'snowcover':      'SnowCover',
  // Subbasin parquet columns for soil moisture (observed in SubbasinChart's
  // getColumnInfo). Both casings exist in the data.
  'danube_soilmoisture_monthly_avg': 'SoilMoisture',
  'danube_soilmoisture_monthly_sum': 'SoilMoisture',
};

export function resolveMetricKey(identifier) {
  if (!identifier) return null;
  const key = String(identifier).toLowerCase().trim();
  return METRIC_ALIASES[key] || null;
}

export function getDisplayConfig(identifier) {
  const key = resolveMetricKey(identifier) || identifier;
  return LAYER_DISPLAY_CONFIG[key] || null;
}

/**
 * Build the axis label string "<Variable Label> (<unit>)" for any identifier
 * (NetCDF filename, parquet column, point-graph variable name). Falls back to
 * the raw identifier when no display config is registered.
 */
export function getAxisLabel(identifier) {
  const cfg = getDisplayConfig(identifier);
  if (!cfg) return identifier || '';
  return `${cfg.label} (${cfg.unit})`;
}

/**
 * Same as getAxisLabel but split into two lines: [label, "(unit)"].
 * Chart.js renders an array of strings as a multi-line title, which keeps the
 * rotated y-axis title short enough to fit narrow chart cards.
 */
export function getAxisLabelLines(identifier) {
  const cfg = getDisplayConfig(identifier);
  if (!cfg) return [identifier || ''];
  return [cfg.label, `(${cfg.unit})`];
}

/**
 * Human-readable info shown in the layers-panel hover tooltips.
 *
 * Keyed by WMS_LAYER_REGISTRY.key so the render in Map.js can do a direct
 * lookup. If an entry's description is missing or empty, the tooltip falls
 * back to DEFAULT_LAYER_INFO_PLACEHOLDER.
 */
export const LAYER_INFO_CONFIG = {
  dem: {
    title: 'Digital Elevation Model',
    description:
      'Terrain elevation in metres above sea level (EGM2008 geoid), from the Copernicus DEM GLO-30 (~30 m) digital surface model clipped to the Danube basin. Static layer — it does not change with the time slider. Use it to correlate hydrological variables with relief, from the Black Sea lowlands to the Alpine headwaters. © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.',
  },
  lulc: {
    title: 'Land Use / Land Cover',
    description:
      'Discrete land-cover classification (forest, cropland, grassland, shrubs, urban, water, wetland, bare, …) from the Copernicus Global Land Service CGLS-LC100 Collection 3, 100 m, epoch 2019, clipped to the Danube basin. Static layer — it does not change with the time slider. Use it to correlate hydrological variables with land cover. © Copernicus Global Land Service (CGLS-LC100 v3), CC-BY 4.0.',
  },
  discharge: {
    title: 'Discharge',
    description:
      'Volumetric river flow simulated by CWatM in the channel at each grid cell. Monthly mean of the daily routed discharge; useful for comparing modeled flow against gauging-station observations and for tracking seasonal flow regimes along the Danube and its tributaries.',
  },
  etref: {
    title: 'Reference Evapotranspiration',
    description:
      'Atmospheric evaporative demand over a standardized reference grass surface, computed with the FAO-56 Penman–Monteith equation. Represents how much water the atmosphere could remove under well-watered conditions; acts as the upper bound for actual ET and drives the ET term in the water balance.',
  },
  iceMelt: {
    title: 'Ice Melt',
    description:
      'Water released by melting of glacier and permanent ice within the grid cell. Significant only in glaciated Alpine headwaters; contributes increasingly to late-summer streamflow as seasonal snowpack is depleted. Zero or near-zero across most of the basin.',
  },
  rain: {
    title: 'Rain',
    description:
      'Liquid-phase precipitation. The fraction of total precipitation that falls as rain rather than snow, partitioned by CWatM using near-surface air temperature. Together with Snow, this sums to the total precipitation forcing the water balance.',
  },
  runoff: {
    title: 'Runoff',
    description:
      'Total water leaving the land surface as runoff, combining overland flow, soil interflow, and groundwater baseflow. This is the hillslope output that feeds routing into the river network — compare with Discharge to separate generation from routing.',
  },
  snow: {
    title: 'Snow',
    description:
      'Solid-phase precipitation. The fraction of total precipitation that falls as snow, partitioned by CWatM using near-surface air temperature. Accumulates on the surface as snowpack and is released later via Snow Melt, shaping spring and early-summer streamflow.',
  },
  snowFraction: {
    title: 'Snow Fraction',
    description:
      'Share of total precipitation falling as snow (0 = all rain, 1 = all snow). Determined by air temperature and used to split precipitation into the Rain and Snow components. Highest in winter and in Alpine elevations; near zero in summer lowlands.',
  },
  snowMelt: {
    title: 'Snow Melt',
    description:
      'Water released from the seasonal snowpack. A primary driver of the spring/early-summer freshet in Alpine headwaters and an important seasonal control on tributary flow timing across the Danube basin.',
  },
  totalETWB: {
    title: 'Total ET (Water Bodies)',
    description:
      'Total actual evapotranspiration returned to the atmosphere from all land and water surfaces, as accounted in the CWatM water-balance closure. Constrained by available water, vegetation, and atmospheric demand (ETRef); the actual ET sink in the equation P = Q + ET + ΔS.',
  },
  tws: {
    title: 'Total Water Storage',
    description:
      'Total terrestrial water storage — the combined water held in soil, groundwater, snowpack, and surface water within the grid cell, expressed as equivalent water height. Changes month-to-month (ΔTWS) close the basin water balance and are comparable to GRACE satellite anomalies.',
  },
  rivers: {
    title: 'River Network',
    description:
      'Vector river network from HydroRIVERS v1.0 (WWF/HydroSHEDS), clipped to the Danube basin and limited to the larger channels (Strahler order ≥ 5). Line width scales with stream order, so the Danube main stem is drawn thicker than its tributaries. Free for scientific, educational and commercial use under the HydroSHEDS license.',
  },
  waterBodies: {
    title: 'Water Bodies',
    description:
      'Lakes and reservoirs from HydroLAKES v1.0 (WWF/HydroSHEDS), clipped to the Danube basin (water bodies ≥ 10 ha), drawn as filled blue polygons. Licensed under Creative Commons Attribution (CC-BY) 4.0 — Messager et al. (2016).',
  },
};

export const DEFAULT_LAYER_INFO_PLACEHOLDER =
  'Description coming soon — see CWatM variables documentation.';

export default LEGEND_ITEMS_CONFIG;
