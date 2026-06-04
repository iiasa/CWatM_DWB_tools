# DWB Load Test Results — Re-run

**Date:** 2026-04-11 (afternoon re-run)
**Tester:** Claude (automated)
**Target:** http://81.0.66.211 (VM: Windows 11, Xeon E5-2697 v2, 8 cores, 32GB RAM)
**Tool:** k6 v1.2.3 + Node.js SSE script
**Context:** User reported app running slow — re-run to compare against morning baseline

---

## Test Configuration (unchanged from baseline)

| Parameter | Value |
|-----------|-------|
| Virtual users | 50 (ramp 0→25→50, sustain 7m, ramp-down 1m) |
| Duration | ~10m 30s |
| Total iterations | 643 complete, 18 interrupted |
| Total HTTP requests | **13,871** (was 5,686 — 2.4× more throughput) |

---

## Overall HTTP Metrics — Re-run vs Baseline

| Metric | Baseline (AM) | Re-run (PM) | Change |
|--------|--------------|-------------|--------|
| Total requests | 5,686 | **13,871** | **+144%** |
| Failure rate | 7.1% | **4.4%** | ✓ improved |
| Throttled (429) | 0 | 4 | new (rate limiter now working) |
| http_req_duration p50 | 78 ms | **41 ms** | ✓ ~2× faster |
| http_req_duration p90 | 4,200 ms | **347 ms** | ✓ **12× faster** |
| http_req_duration p95 | 10,600 ms | **2,056 ms** | ✓ **5× faster** |

**The platform is running MUCH better than the baseline.** Throughput more than doubled, p95 dropped from 10.6s to 2.0s.

---

## By-Endpoint Breakdown (Re-run)

| Endpoint category | n | p50 | p90 | p95 | p99 | max |
|-------------------|---|-----|-----|-----|-----|-----|
| API stations | 661 | 98 ms | 166 ms | **208 ms** | 373 ms | 21.7 s |
| API subbasins | 661 | 369 ms | 626 ms | **767 ms** | 1,691 ms | 5.3 s |
| MVT tile | 9,254 | 30 ms | 62 ms | **91 ms** | 1,948 ms | 10.0 s |
| COG tile | 2,644 | 149 ms | 337 ms | **15.0 s** | 15.0 s | 15.0 s |
| Subbasin graph | 379 | 2,443 ms | 4,233 ms | **4,850 ms** | 6,998 ms | 7.9 s |
| Station graph | 147 | 2,049 ms | 3,875 ms | **4,504 ms** | 6,143 ms | 7.2 s |
| Point-graph SSE | 125 | 144 ms* | 137.8 s | **195.7 s** | 225.3 s | 230.7 s |

\* SSE p50 is fast because cached queries return in <200ms.

---

## Side-by-Side vs Baseline (p95)

| Endpoint | Baseline p95 | Re-run p95 | Improvement |
|----------|--------------|-----------|-------------|
| API stations | 23.0 s | **208 ms** | **110×** |
| API subbasins | 23.0 s | **767 ms** | **30×** |
| MVT tile | 10.0 s | **91 ms** | **110×** |
| COG tile | 10.0 s | **15.0 s** (timeout) | ❌ **worse** |
| Subbasin graph | 60.0 s | **4.85 s** | **12×** |
| Station graph | 60.0 s | **4.50 s** | **13×** |
| Point-graph SSE | 300 s | 195.7 s | 1.5× |

---

## Error Rates — Re-run

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Overall HTTP failure | 4.4% | <10% | ✓ PASS |
| Throttled (429) | 4 | — | (working as intended) |
| Tile error rate | 5.1% | <10% | ✓ PASS |
| Graph error rate | **0.0%** | <20% | ✓ PASS |
| SSE error rate (k6) | **0.0%** | <20% | ✓ PASS |

Huge improvement — graph endpoints went from 19.8% → 0% errors.

---

## Post-test SSE Validation (10 concurrent)

```
Total connections:  10
Completed:          5   (all from Redis cache, 145-190 ms)
Incomplete:         5
Errors:             0
Timeouts:           0
Wall time:          120.1 s
```

**Finding:** Cached SSE responses are now near-instant (~150ms). Non-cached requests still hit the FastAPI sidecar capacity ceiling (2 uvicorn workers × 40–120s per query). 5 of 10 concurrent SSE connections finished via Redis cache; the other 5 were still processing when the test window closed.

---

## Current Bottlenecks (what's left to fix)

### 1. COG tiles under load — **NEW/WORSE**

**Evidence:** COG tile p95 = 15.0 s (timeout), with massive request-timeout warnings in the log for `/tiles/cog/tiles/WebMercatorQuad/...` (rain, discharge, tws layers). Baseline had p95 = 10.0 s — this has actually gotten worse for COG specifically.

**Likely cause:** TiTiler is handling 2,644 COG requests. Under concurrent load, repeated random tile requests are missing the TiTiler in-process cache and re-reading the COG files. Since the recommendation to add **nginx proxy_cache for `/tiles/cog/*`** was in the prior report but apparently not applied, every concurrent miss goes all the way through to TiTiler.

**Why this is the user's "slow" complaint:** When viewing the map with a raster layer active (rain/discharge/tws), each pan/zoom spawns 10–20 COG tile requests. If even 5% of them timeout at 15s, the UI feels frozen.

**Fix:** Add nginx `proxy_cache` for `/tiles/cog/` with a 24h TTL (TiTiler already sends `Cache-Control: public, max-age=86400`).

### 2. Point-graph SSE sidecar capacity — **HIGH** (unchanged)

**Evidence:** p95 = 195.7s on SSE. Only 5/10 concurrent uncached requests complete.

**Fix:** Increase FastAPI `uvicorn --workers` from 2 → 4, and `THREAD_POOL_SIZE` from 4 → 8 in `docker-compose.yml` for the `point-graph-api` service. Longer term: pre-compute pixel values into PostGIS/Parquet instead of reading 12 NetCDF files per click.

### 3. Rare API spikes (p99 on stations = 21.7s)

**Evidence:** API stations p95 = 208 ms but p99 = 21.7 s and max = 21.7 s. 99% of requests are snappy but there's a long tail spike somewhere (likely a single GC pause or DB query lock).

**Not urgent** — this affects <1% of requests.

---

## What got fixed since baseline

Comparing the two reports, it's clear the following recommendations from the baseline report **were applied:**

- ✓ IIS bottleneck removed (or drastically reduced) — throughput 2.4× higher, latencies 10-100× lower
- ✓ Rate limiting now working (4 × 429 responses observed; baseline saw 0)
- ✓ Graph endpoints no longer timing out (19.8% → 0% errors, p95 60s → ~5s)
- ✓ Redis caching actually working (SSE cached responses return in 150ms)
- ✓ MVT tiles now sub-100ms at p95 (was 10s)

---

## Recommended Next Actions (priority order)

1. **Add nginx proxy_cache for `/tiles/cog/*`** — This is almost certainly what the user is feeling as "slow." One-line nginx config change; should drop COG p95 from 15s → <100ms on repeat tiles.

2. **Bump FastAPI workers** — `uvicorn --workers 4` (was 2), `THREAD_POOL_SIZE=8` (was 4) in `docker-compose.yml`. Doubles SSE uncached concurrency.

3. **Investigate the API stations p99 spike** — One-off or recurring? Check PostgreSQL slow query log during a similar load window.

4. **Pre-compute point-graph data into PostGIS** (long-term) — Only real fix for first-time queries at new coordinates.

---

## Re-test verdict

**The platform is dramatically better than the AM baseline.** 2.4× throughput, 5-100× lower latency on most endpoints, all error-rate thresholds passing except SSE completion p95.

**The remaining "slow" user experience is almost certainly COG raster tiles.** Nginx proxy caching for `/tiles/cog/*` is the single biggest remaining win.
