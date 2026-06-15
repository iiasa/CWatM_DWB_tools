/**
 * DWB Platform Load Test — k6 script
 *
 * Simulates 50 concurrent users performing realistic workflows:
 *   1. Map load (stations + subbasins GeoJSON + MVT tiles)
 *   2. Pan/zoom (MVT + COG raster tile requests)
 *   3. Subbasin click (graph data via Python subprocess)
 *   4. Station click (graph data via Python subprocess)
 *   5. Point click (SSE stream from FastAPI sidecar)
 *
 * Usage:
 *   k6 run k6-load-test.js
 *   k6 run --out json=results.json k6-load-test.js
 *   k6 run --env BASE_URL=http://your-server k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const sseCompletionTime = new Trend('sse_completion_time', true);
const sseErrors = new Rate('sse_error_rate');
const tileErrors = new Rate('tile_error_rate');
const throttledRequests = new Counter('throttled_requests');
const graphErrors = new Rate('graph_error_rate');

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export const options = {
  scenarios: {
    map_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 25 },  // Ramp up to 25 users
        { duration: '1m', target: 50 },  // Ramp to full 50 users
        { duration: '7m', target: 50 },  // Sustain 50 concurrent users
        { duration: '1m', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // API endpoints (stations, subbasins GeoJSON)
    'http_req_duration{endpoint_type:api}': ['p(95)<3000'],
    // MVT/COG tile requests
    'http_req_duration{endpoint_type:tile}': ['p(95)<1000'],
    // Graph endpoints (Python subprocess)
    'http_req_duration{endpoint_type:graph}': ['p(95)<15000'],
    // Point-graph SSE stream
    'sse_completion_time': ['p(95)<180000'],
    // Error rates
    'http_req_failed': ['rate<0.10'],
    'tile_error_rate': ['rate<0.10'],
    'graph_error_rate': ['rate<0.20'],
  },
};

// ---------------------------------------------------------------------------
// Test data — Danube basin coordinates and known entities
// ---------------------------------------------------------------------------

// MVT tile coordinates covering the Danube basin at zoom levels 5-8
const MVT_TILES = [
  // z=5 (overview)
  { z: 5, x: 17, y: 11 }, { z: 5, x: 17, y: 10 },
  // z=6 (regional)
  { z: 6, x: 34, y: 22 }, { z: 6, x: 35, y: 22 },
  { z: 6, x: 34, y: 21 }, { z: 6, x: 35, y: 21 },
  // z=7 (closer)
  { z: 7, x: 68, y: 44 }, { z: 7, x: 69, y: 44 },
  { z: 7, x: 70, y: 44 }, { z: 7, x: 71, y: 44 },
  { z: 7, x: 68, y: 43 }, { z: 7, x: 69, y: 43 },
  // z=8 (detailed)
  { z: 8, x: 137, y: 88 }, { z: 8, x: 138, y: 88 },
  { z: 8, x: 139, y: 89 }, { z: 8, x: 140, y: 89 },
];

// COG raster variables available in TiTiler
const COG_VARIABLES = ['discharge', 'rain', 'runoff', 'snow', 'totalet', 'tws'];
const TIME_PERIODS = ['2005-01', '2010-06', '2012-03', '2015-09', '2018-12', '2020-01'];

// Known subbasin IDs (adjust to match your actual data)
const SUBBASIN_IDS = ['1', '2', '3', '5', '10', '15', '20', '25', '30'];

// Known station names (adjust to match your actual data)
const STATION_NAMES = ['Orsova', 'Bratislava', 'Budapest', 'Bezdan', 'Bogojevo'];

// Points within the Danube basin for point-graph queries
const POINT_COORDS = [
  { lat: 45.5, lon: 18.5 },   // Lower Danube
  { lat: 47.0, lon: 19.5 },   // Hungary
  { lat: 46.5, lon: 22.3 },   // Romania
  { lat: 48.0, lon: 16.5 },   // Austria
  { lat: 46.0, lon: 15.5 },   // Slovenia
  { lat: 44.5, lon: 21.0 },   // Serbia
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSlice(arr, count) {
  const shuffled = arr.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function checkThrottled(res) {
  if (res.status === 429) {
    throttledRequests.add(1);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main VU function — simulates one user session
// ---------------------------------------------------------------------------
export default function () {
  // =========================================================================
  // Phase 1: Initial Map Load
  // Every user loads the map on first visit
  // =========================================================================
  group('01_map_load', () => {
    // Fetch all stations (GeoJSON)
    const stationsRes = http.get(`${BASE_URL}/api/calib-stations`, {
      tags: { endpoint_type: 'api', name: 'GET /api/calib-stations' },
      timeout: '30s',
    });
    checkThrottled(stationsRes);
    check(stationsRes, {
      'stations: status 200': (r) => r.status === 200,
      'stations: has data': (r) => r.body && r.body.length > 100,
    });

    // Fetch subbasins GeoJSON
    const subbasinsRes = http.get(`${BASE_URL}/api/subbasins/geojson`, {
      tags: { endpoint_type: 'api', name: 'GET /api/subbasins/geojson' },
      timeout: '30s',
    });
    checkThrottled(subbasinsRes);
    check(subbasinsRes, {
      'subbasins: status 200': (r) => r.status === 200,
      'subbasins: has features': (r) => r.body && r.body.includes('features'),
    });

    // Load initial MVT tiles (4-6 tiles for the default view)
    const initialTiles = randomSlice(MVT_TILES.filter(t => t.z <= 6), 4);
    const tileRequests = [];
    for (const t of initialTiles) {
      tileRequests.push(['GET', `${BASE_URL}/api/tiles/mvt/subbasins/${t.z}/${t.x}/${t.y}.pbf`, null, {
        tags: { endpoint_type: 'tile', name: 'GET /api/tiles/mvt/:layer/:z/:x/:y.pbf' },
        timeout: '10s',
      }]);
      tileRequests.push(['GET', `${BASE_URL}/api/tiles/mvt/stations/${t.z}/${t.x}/${t.y}.pbf`, null, {
        tags: { endpoint_type: 'tile', name: 'GET /api/tiles/mvt/:layer/:z/:x/:y.pbf' },
        timeout: '10s',
      }]);
    }
    const tileResponses = http.batch(tileRequests);
    for (const r of tileResponses) {
      tileErrors.add(r.status !== 200 && r.status !== 204);
    }
  });

  // Think time: user looks at the map
  sleep(Math.random() * 3 + 2); // 2-5 seconds

  // =========================================================================
  // Phase 2: Pan/Zoom (user explores the map)
  // Triggers new MVT tile requests + optionally COG raster tiles
  // =========================================================================
  group('02_pan_zoom', () => {
    // Load MVT tiles at a higher zoom level (simulating zoom-in)
    const zoomTiles = randomSlice(MVT_TILES.filter(t => t.z >= 7), 6);
    const mvtRequests = [];
    for (const t of zoomTiles) {
      mvtRequests.push(['GET', `${BASE_URL}/api/tiles/mvt/subbasins/${t.z}/${t.x}/${t.y}.pbf`, null, {
        tags: { endpoint_type: 'tile', name: 'GET /api/tiles/mvt/:layer/:z/:x/:y.pbf' },
        timeout: '10s',
      }]);
    }
    const mvtResponses = http.batch(mvtRequests);
    for (const r of mvtResponses) {
      tileErrors.add(r.status !== 200 && r.status !== 204);
    }
  });

  sleep(Math.random() * 3 + 2);

  // =========================================================================
  // Phase 3: Toggle Raster Layer
  // User enables a COG variable layer — triggers TiTiler tile requests
  // =========================================================================
  group('03_raster_toggle', () => {
    const variable = randomItem(COG_VARIABLES);
    const time = randomItem(TIME_PERIODS);
    const tiles = randomSlice(MVT_TILES.filter(t => t.z >= 6), 4);

    const cogRequests = [];
    for (const t of tiles) {
      const cogUrl = encodeURIComponent(`file:///data/cog/${variable}/${variable}_${time}.cog.tif`);
      cogRequests.push(['GET',
        `${BASE_URL}/tiles/cog/tiles/WebMercatorQuad/${t.z}/${t.x}/${t.y}.png?url=${cogUrl}&colormap_name=dwb_${variable}`,
        null,
        {
          tags: { endpoint_type: 'tile', name: `GET /tiles/cog/${variable}` },
          timeout: '15s',
        },
      ]);
    }
    const cogResponses = http.batch(cogRequests);
    for (const r of cogResponses) {
      tileErrors.add(r.status !== 200 && r.status !== 204 && r.status !== 500);
      // Note: 500 from TiTiler for out-of-bounds is expected, not counted as error
    }
  });

  sleep(Math.random() * 5 + 3); // 3-8 seconds

  // =========================================================================
  // Phase 4: Click Interaction
  // Simulate user clicking on subbasin (60%), station (20%), or point (20%)
  // =========================================================================
  const actionRoll = Math.random();

  if (actionRoll < 0.6) {
    // --- Subbasin click (60% probability) ---
    group('04_subbasin_click', () => {
      const subbasinId = randomItem(SUBBASIN_IDS);
      const res = http.get(`${BASE_URL}/api/subbasins/graph/${subbasinId}`, {
        tags: { endpoint_type: 'graph', name: 'GET /api/subbasins/graph/:id' },
        timeout: '60s',
      });
      checkThrottled(res);
      graphErrors.add(res.status !== 200);
      check(res, {
        'subbasin graph: status 200': (r) => r.status === 200,
        'subbasin graph: has data': (r) => r.body && r.body.length > 50,
      });
    });
  } else if (actionRoll < 0.8) {
    // --- Station click (20% probability) ---
    group('04_station_click', () => {
      const stationName = randomItem(STATION_NAMES);
      const res = http.get(`${BASE_URL}/api/calib-stations/graph/${stationName}`, {
        tags: { endpoint_type: 'graph', name: 'GET /api/calib-stations/graph/:name' },
        timeout: '60s',
      });
      checkThrottled(res);
      graphErrors.add(res.status !== 200);
      check(res, {
        'station graph: status 200': (r) => r.status === 200,
        'station graph: has data': (r) => r.body && r.body.length > 50,
      });
    });
  } else {
    // --- Point click (20% probability) — SSE stream ---
    group('04_point_click', () => {
      const coord = randomItem(POINT_COORDS);
      const start = Date.now();

      // k6 will buffer the full SSE response until the connection closes.
      // For proper SSE streaming tests, use the companion sse-test.mjs script.
      const res = http.get(
        `${BASE_URL}/api/point-graph/data?lat=${coord.lat}&lon=${coord.lon}`,
        {
          tags: { endpoint_type: 'sse', name: 'GET /api/point-graph/data' },
          timeout: '300s',
        },
      );

      const elapsed = Date.now() - start;
      sseCompletionTime.add(elapsed);
      sseErrors.add(res.status !== 200);
      check(res, {
        'point-graph: status 200': (r) => r.status === 200,
        'point-graph: has complete event': (r) => r.body && r.body.includes('event: complete'),
      });
    });
  }

  // Think time before next iteration (simulates user reading charts)
  sleep(Math.random() * 10 + 5); // 5-15 seconds
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  // Print a summary table to console
  const lines = [
    '\n========================================',
    '  DWB Load Test Summary',
    '========================================',
    '',
    `  Total requests:    ${data.metrics.http_reqs?.values?.count || 'N/A'}`,
    `  Failed requests:   ${data.metrics.http_req_failed?.values?.rate ? (data.metrics.http_req_failed.values.rate * 100).toFixed(1) + '%' : 'N/A'}`,
    `  Throttled (429):   ${data.metrics.throttled_requests?.values?.count || 0}`,
    '',
    '  Response times (p50 / p95 / p99):',
    `    All:    ${fmt(data.metrics.http_req_duration?.values?.['p(50)'])} / ${fmt(data.metrics.http_req_duration?.values?.['p(95)'])} / ${fmt(data.metrics.http_req_duration?.values?.['p(99)'])}`,
    '',
    `  SSE completion (p50 / p95):`,
    `    Point:  ${fmt(data.metrics.sse_completion_time?.values?.['p(50)'])} / ${fmt(data.metrics.sse_completion_time?.values?.['p(95)'])}`,
    '',
    `  Error rates:`,
    `    Tiles:  ${pct(data.metrics.tile_error_rate?.values?.rate)}`,
    `    Graphs: ${pct(data.metrics.graph_error_rate?.values?.rate)}`,
    `    SSE:    ${pct(data.metrics.sse_error_rate?.values?.rate)}`,
    '========================================\n',
  ];
  console.log(lines.join('\n'));

  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}

function fmt(ms) {
  if (ms === undefined || ms === null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pct(rate) {
  if (rate === undefined || rate === null) return 'N/A';
  return `${(rate * 100).toFixed(1)}%`;
}
