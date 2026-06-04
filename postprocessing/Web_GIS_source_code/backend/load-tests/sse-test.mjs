/**
 * DWB Point-Graph SSE Load Test (Node.js)
 *
 * k6 does not natively support SSE streaming, so this script tests
 * the point-graph SSE endpoint specifically. It opens concurrent SSE
 * connections and measures:
 *   - Time to first partial event
 *   - Time to complete event
 *   - Number of datasets received
 *   - Error and timeout rates
 *
 * Usage:
 *   node sse-test.mjs                           # 5 concurrent, default server
 *   node sse-test.mjs --concurrency 10          # 10 concurrent
 *   node sse-test.mjs --url http://your-server  # custom server
 *
 * Requirements:
 *   Node.js 18+ (uses native fetch and AbortController)
 */

import http from 'node:http';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const BASE_URL = getArg('url', 'http://localhost');
const CONCURRENCY = parseInt(getArg('concurrency', '5'), 10);
const TIMEOUT_MS = parseInt(getArg('timeout', '300000'), 10); // 5 minutes

// Points within the Danube basin
const POINT_COORDS = [
  { lat: 45.5, lon: 18.5 },
  { lat: 47.0, lon: 19.5 },
  { lat: 46.5, lon: 22.3 },
  { lat: 48.0, lon: 16.5 },
  { lat: 46.0, lon: 15.5 },
  { lat: 44.5, lon: 21.0 },
  { lat: 47.5, lon: 18.0 },
  { lat: 45.0, lon: 20.0 },
  { lat: 48.2, lon: 14.5 },
  { lat: 43.8, lon: 22.5 },
];

// ---------------------------------------------------------------------------
// SSE Client using raw http.get (works in Node 18+)
// ---------------------------------------------------------------------------
function testSSEConnection(coord, index) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}/api/point-graph/data?lat=${coord.lat}&lon=${coord.lon}`;
    const startTime = Date.now();
    let firstPartialTime = null;
    let completeTime = null;
    let datasetCount = 0;
    let progressEvents = 0;
    let buffer = '';
    let timedOut = false;

    const result = {
      index,
      coord: `(${coord.lat}, ${coord.lon})`,
      status: 'pending',
      httpStatus: null,
      timeToFirstPartial: null,
      timeToComplete: null,
      totalTime: null,
      datasetCount: 0,
      progressEvents: 0,
      error: null,
      cached: false,
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      result.status = 'timeout';
      result.totalTime = TIMEOUT_MS;
      req.destroy();
      resolve(result);
    }, TIMEOUT_MS);

    const req = http.get(url, (res) => {
      result.httpStatus = res.statusCode;

      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        result.status = 'http_error';
        result.error = `HTTP ${res.statusCode}`;
        res.resume();
        resolve(result);
        return;
      }

      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        if (timedOut) return;

        buffer += chunk;
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;

          const lines = part.split('\n');
          const eventLine = lines.find(l => l.startsWith('event: '));
          const dataLine = lines.find(l => l.startsWith('data: '));

          if (!eventLine) continue;
          const eventName = eventLine.substring(7).trim();

          if (eventName === 'progress') {
            progressEvents++;
          } else if (eventName === 'partial') {
            datasetCount++;
            if (!firstPartialTime) {
              firstPartialTime = Date.now() - startTime;
              result.timeToFirstPartial = firstPartialTime;
            }
          } else if (eventName === 'complete') {
            completeTime = Date.now() - startTime;
            result.timeToComplete = completeTime;

            // Check if this was a cache hit (very fast completion)
            if (completeTime < 2000) {
              result.cached = true;
            }

            // Try to count datasets in the complete payload
            if (dataLine) {
              try {
                const data = JSON.parse(dataLine.substring(6));
                if (data.datasets) {
                  datasetCount = Object.keys(data.datasets).length;
                }
              } catch { /* ignore parse errors */ }
            }
          } else if (eventName === 'error') {
            result.error = dataLine ? dataLine.substring(6) : 'unknown error';
          }
        }
      });

      res.on('end', () => {
        if (timedOut) return;
        clearTimeout(timeout);

        result.totalTime = Date.now() - startTime;
        result.datasetCount = datasetCount;
        result.progressEvents = progressEvents;

        if (result.error) {
          result.status = 'error';
        } else if (completeTime) {
          result.status = 'complete';
        } else {
          result.status = 'incomplete';
        }
        resolve(result);
      });
    });

    req.on('error', (err) => {
      if (timedOut) return;
      clearTimeout(timeout);
      result.status = 'connection_error';
      result.error = err.message;
      result.totalTime = Date.now() - startTime;
      resolve(result);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60));
  console.log('  DWB Point-Graph SSE Load Test');
  console.log('='.repeat(60));
  console.log(`  Server:      ${BASE_URL}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Timeout:     ${TIMEOUT_MS / 1000}s`);
  console.log(`  Points:      ${POINT_COORDS.length} available`);
  console.log('='.repeat(60));
  console.log('');

  // Select coordinates for this run (cycle if concurrency > points)
  const coords = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    coords.push(POINT_COORDS[i % POINT_COORDS.length]);
  }

  console.log(`Starting ${CONCURRENCY} concurrent SSE connections...\n`);
  const overallStart = Date.now();

  // Launch all connections concurrently
  const promises = coords.map((coord, i) => testSSEConnection(coord, i + 1));
  const results = await Promise.all(promises);

  const overallTime = Date.now() - overallStart;

  // ---------------------------------------------------------------------------
  // Results summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(60));
  console.log('  Individual Results');
  console.log('-'.repeat(60));

  for (const r of results) {
    const status = r.status === 'complete' ? '\u2713' :
                   r.status === 'timeout' ? '\u23F1' :
                   '\u2717';
    const cached = r.cached ? ' [CACHED]' : '';
    console.log(
      `  ${status} #${String(r.index).padStart(2)} ${r.coord.padEnd(16)} ` +
      `${r.status.padEnd(12)} ` +
      `first=${fmt(r.timeToFirstPartial)} ` +
      `complete=${fmt(r.timeToComplete)} ` +
      `datasets=${r.datasetCount}` +
      `${cached}` +
      `${r.error ? ` err=${r.error}` : ''}`
    );
  }

  // Aggregate stats
  const completed = results.filter(r => r.status === 'complete');
  const cached = results.filter(r => r.cached);
  const errors = results.filter(r => ['error', 'connection_error', 'http_error'].includes(r.status));
  const timeouts = results.filter(r => r.status === 'timeout');

  const completeTimes = completed.filter(r => !r.cached).map(r => r.timeToComplete).sort((a, b) => a - b);
  const firstPartialTimes = completed.filter(r => !r.cached && r.timeToFirstPartial).map(r => r.timeToFirstPartial).sort((a, b) => a - b);

  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  console.log(`  Total connections:  ${results.length}`);
  console.log(`  Completed:          ${completed.length}`);
  console.log(`  Cached (instant):   ${cached.length}`);
  console.log(`  Errors:             ${errors.length}`);
  console.log(`  Timeouts:           ${timeouts.length}`);
  console.log(`  Overall wall time:  ${fmt(overallTime)}`);

  if (completeTimes.length > 0) {
    console.log('');
    console.log('  Completion time (non-cached):');
    console.log(`    p50:  ${fmt(percentile(completeTimes, 50))}`);
    console.log(`    p95:  ${fmt(percentile(completeTimes, 95))}`);
    console.log(`    p99:  ${fmt(percentile(completeTimes, 99))}`);
    console.log(`    min:  ${fmt(completeTimes[0])}`);
    console.log(`    max:  ${fmt(completeTimes[completeTimes.length - 1])}`);
  }

  if (firstPartialTimes.length > 0) {
    console.log('');
    console.log('  Time to first partial (non-cached):');
    console.log(`    p50:  ${fmt(percentile(firstPartialTimes, 50))}`);
    console.log(`    p95:  ${fmt(percentile(firstPartialTimes, 95))}`);
  }

  console.log('='.repeat(60));

  // Exit with error code if too many failures
  const failRate = (errors.length + timeouts.length) / results.length;
  if (failRate > 0.5) {
    console.log('\n  FAIL: >50% of connections failed or timed out');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(ms) {
  if (ms === undefined || ms === null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
