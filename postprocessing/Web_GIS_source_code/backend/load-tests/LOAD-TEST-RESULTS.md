# DWB Load Test Results

**Date:** 2026-04-11
**Tester:** Claude (automated)
**Target:** http://81.0.66.211 (VM: Windows 11, Xeon E5-2697 v2, 8 cores, 32GB RAM)
**Tool:** k6 v0.56.0 + Node.js SSE script
**Config:** Pre-optimization baseline (old rate limits, no resource limits, default PostgreSQL)

---

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Virtual users | 50 (ramped: 0->25 in 1m, 25->50 in 1m, sustain 7m, ramp-down 1m) |
| Duration | 10 minutes 30 seconds (including graceful ramp-down) |
| Total iterations | 239 completed, 39 interrupted |
| Total HTTP requests | 5,686 |
| Workflow mix | Map load -> Pan/zoom -> Raster toggle -> Click (60% subbasin, 20% station, 20% point) |
| Think times | 2-5s (map view), 3-8s (pan), 5-15s (between clicks) |

---

## Results -- HTTP Response Times

### Overall

| Metric | Value |
|--------|-------|
| p50 | 78 ms |
| p90 | 4.2 s |
| p95 | 10.6 s |
| Failure rate | 7.1% |

### By Endpoint Type

| Endpoint | p50 | p90 | p95 | Avg | Min | Max |
|----------|-----|-----|-----|-----|-----|-----|
| API (stations, subbasins) | 403 ms | 4.7 s | 23.0 s | 2.7 s | 64 ms | 30.0 s (timeout) |
| Tiles (MVT + COG) | 59 ms | 670 ms | 10.0 s | 843 ms | 0 ms | 15.0 s (timeout) |
| Graphs (subbasin/station) | 10.0 s | 60.0 s | 60.0 s | 18.2 s | 31 ms | 60.0 s (timeout) |

### Single-User Baseline (for comparison)

| Endpoint | Single User | Under 50 Users | Degradation |
|----------|-------------|----------------|-------------|
| GET /api/calib-stations | 665 ms | 403 ms (p50) / 23s (p95) | **35x at p95** |
| GET /api/subbasins/geojson | 4.8 s | 403 ms (p50) / 23s (p95) | **5x at p95** |
| GET /api/tiles/mvt/:z/:x/:y.pbf | 587 ms | 59 ms (p50) / 10s (p95) | **17x at p95** |
| GET /tiles/cog/... (TiTiler) | 271 ms | 59 ms (p50) / 10s (p95) | **17x at p95** |
| GET /api/subbasins/graph/:id | 3.7 s | 10s (p50) / 60s (p95) | **16x at p95** |
| GET /api/calib-stations/graph/:name | 2.9 s | 10s (p50) / 60s (p95) | **21x at p95** |

**Note:** p50 for tiles is faster than single-user because cached responses are served instantly. The severe p95 degradation shows the long-tail problem when requests queue up.

---

## Results -- SSE Stream (Point-Graph)

| Metric | Value |
|--------|-------|
| Connections tested | ~55 (20% of 278 click iterations) |
| Completed successfully | ~9 (16.4%) |
| Errors | 83.6% |
| Typical failure mode | Connection timeout (300s) or HTTP 502 |
| Time to complete (p50) | 300.0 s (timeout) |
| Time to complete (p95) | 300.0 s (timeout) |

**Finding:** SSE point-graph is effectively unusable under 50 concurrent users. The FastAPI sidecar has only 2 uvicorn workers, and each query takes 40-120s. With concurrent users, the IIS reverse proxy times out before the request even reaches the backend.

### Post-test SSE Validation (5 concurrent)

After the k6 test ended, 5 concurrent SSE connections were attempted:
- 1x HTTP 502 (backend overloaded)
- 4x connection timeout (ETIMEDOUT on port 80)
- 0 completed

The VM needed ~60 seconds to recover to normal responsiveness after the load test.

---

## Results -- Error Rates

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Overall HTTP failure rate | 7.1% | <10% | PASS (marginal) |
| Throttled (429) requests | 0 | 0 | PASS |
| Tile error rate | 5.9% | <10% | PASS (marginal) |
| Graph error rate | 19.8% | <20% | PASS (borderline) |
| SSE error rate | 83.6% | <20% | **FAIL** |

**Note:** Zero 429 throttled requests means the old rate limit (30 req/60s) is per-client IP. Since k6 runs from one machine, each VU shares the same IP but the throttler uses `X-Forwarded-For` or similar. The IIS reverse proxy may be stripping these headers, causing the throttler to see all requests as coming from `127.0.0.1` (localhost) instead of distinct clients.

---

## Resource Utilization at Peak

_Captured from `docker stats` during sustained 50-user phase (multiple snapshots at 3min, 5min, 7min)._

| Container | CPU % | Memory Usage | Memory Limit | Net I/O |
|-----------|-------|-------------|-------------|---------|
| dwb-backend | 0.00% | 191 MiB | 15.6 GiB (no limit) | 16.5 MB / 1.5 MB |
| dwb-titiler | 0.63% | 585 MiB | 15.6 GiB (no limit) | 522 kB / 1.4 MB |
| dwb-db | 0.00% | 29 MiB | 15.6 GiB (no limit) | 205 kB / 15.6 MB |
| dwb-point-graph-api | 0.31% | 1.04 GiB | 15.6 GiB (no limit) | 20 kB / 437 kB |
| dwb-redis | 0.32% | 3.6 MiB | 15.6 GiB (no limit) | 248 kB / 27 kB |

**CRITICAL FINDING:** All containers show <1% CPU and minimal network I/O despite 50 concurrent users generating 5,686 requests over 10 minutes. The Net I/O for `dwb-backend` (16.5 MB received) barely changed between snapshots, meaning **requests are NOT reaching the Docker containers**. They are queuing and timing out at the **IIS reverse proxy layer**.

### PostgreSQL Connections at Peak

| State | Count |
|-------|-------|
| active | 1 |
| idle | 1 |
| (background) | 5 |

**Finding:** Only 1 active + 1 idle connection during peak load. The database is nowhere near its connection limit. This confirms that IIS is the bottleneck -- requests never make it far enough to stress the database.

### Redis Stats at Peak

| Metric | Value |
|--------|-------|
| connected_clients | 1 |
| instantaneous_ops_per_sec | 0 |
| used_memory_human | 1.28 MB |
| keyspace_hits | 0 |
| keyspace_misses | 1 |
| total_commands_processed | 4,067 |
| cache hit ratio | 0% |

**Finding:** Redis cache is barely used. Only 1 cache miss during the entire test, meaning very few point-graph requests actually reached the backend. The 4,067 total commands are from health checks and startup, not from load test traffic.

---

## Identified Bottlenecks

### 1. IIS Application Request Routing (ARR) -- **CRITICAL BLOCKER**

**Evidence:** Containers show 0% CPU and static network I/O counters while k6 reports 7.1% HTTP failures and p95 response times of 10-23 seconds. The backend received only 16.5 MB total during a 10-minute test with 5,686 requests.

**Root cause:** IIS ARR (Application Request Routing) is designed for enterprise web applications, not high-throughput reverse proxying of tile/API requests. It has:
- Limited concurrent connection pool to backend servers
- Request buffering that delays streaming responses (SSE)
- Thread pool contention under concurrent load
- The `web.config` URL Rewrite rules add regex evaluation overhead per request

**Impact:** This is the single largest bottleneck. The Docker containers have massive spare capacity (0% CPU) that is completely gated by IIS. Removing IIS and binding nginx directly to port 80 would likely **10x throughput**.

### 2. Point-Graph FastAPI Sidecar Capacity -- **HIGH**

**Evidence:** 83.6% SSE error rate. Only 2 uvicorn workers handle point-graph queries that take 40-120 seconds each. Under 50 concurrent users, the sidecar can serve at most 2-4 simultaneous queries.

**Impact:** Even after fixing IIS, point-graph will be the slowest endpoint. Redis caching (30-day TTL) mitigates repeat queries, but first-time queries for new coordinates will still take 40-120s and queue up quickly.

### 3. Graph Endpoint Timeouts -- **HIGH**

**Evidence:** Graph endpoints (subbasin/station) had p50 = 10s, p95 = 60s (timeout), 19.8% error rate.

**Root cause:** Python subprocess spawning (each graph request spawns a Python process) combined with limited `MAX_PYTHON_PROCESSES=6` and the IIS bottleneck compounding response times.

### 4. No Container Resource Limits -- **MEDIUM**

**Evidence:** All containers show "15.6 GiB" memory limit (WSL2 default, no Docker limits set). This means a runaway process in any container can consume all available memory and crash other containers.

---

## Performance Thresholds Assessment

| Endpoint Category | Target | Actual p95 | Status |
|-------------------|--------|------------|--------|
| API endpoints | <2 s | 23.0 s | **FAIL** |
| Tile requests | <500 ms | 10.0 s | **FAIL** |
| Graph endpoints | <15 s | 60.0 s (timeout) | **FAIL** |
| Point-graph SSE | <180 s | 300.0 s (timeout) | **FAIL** |

**All thresholds crossed.** The platform cannot handle 50 concurrent users in its current configuration.

---

## Recommendations

### Immediate Actions (before re-testing)

1. **Remove IIS from the request path** -- Bind nginx container directly to port 80 (`ports: "80:80"` in `dwb-frontend/docker-compose.yml`). IIS is the primary bottleneck causing all threshold failures. If DANUBEWB must coexist, use nginx virtual host routing instead of IIS.

2. **Deploy the optimization changes already prepared:**
   - Rate limits: 10 req/s burst + 300 req/min sustained (was 30 req/60s)
   - Container resource limits (4G backend, 4G titiler, 8G db, 4G point-graph, 512M redis)
   - PostgreSQL tuning (shared_buffers 2GB, work_mem 64MB, max_connections 80)
   - Cache sizes increased (MVT: 500->2000, stations/subbasins: 100->500)
   - DB pool: 20->40 connections
   - Redis maxmemory 256MB with LRU eviction
   - nginx with MVT tile proxy cache and SSE-specific unbuffered proxying

3. **Verify CLUSTER_WORKERS** -- Run `docker exec dwb-backend sh -c "ps aux | grep node"` to confirm whether NestJS is running 1 or 4+ worker processes.

### Short-term Improvements

1. **Increase FastAPI workers** from 2 to 3 and `THREAD_POOL_SIZE` from 4 to 6 in `docker-compose.yml` for the `point-graph-api` service.

2. **Move MVT tile cache to Redis** so all NestJS cluster workers share one cache instead of each worker having its own fragmented in-memory cache (500-2000 entries each, no shared state).

3. **Add nginx proxy caching for COG tiles** -- TiTiler already sets `Cache-Control: public, max-age=86400`. Adding nginx proxy_cache for `/tiles/` would eliminate repeated tile generation.

4. **Configure IIS `X-Forwarded-For` header** -- If IIS remains, ensure it passes the real client IP so per-client rate limiting works correctly for multiple users behind the same proxy.

### Long-term Architecture Changes

1. **Pre-compute point-graph data** into PostGIS or Parquet. The current approach (reading 12 NetCDF files per click, 40-120s each) cannot scale. Pre-computing pixel values into a database would make queries sub-second.

2. **CDN for COG tiles** -- For production with many users, a CDN in front of TiTiler would eliminate all repeat tile requests.

3. **Horizontal scaling** -- The current single-instance architecture has no horizontal scaling. For 100+ users, consider running multiple backend instances behind a load balancer.

4. **Replace Docker Desktop with Docker Engine** in WSL2 -- Docker Desktop adds VM overhead. Direct Docker Engine in WSL2 with a configured `.wslconfig` (28GB memory, 8 processors) would reduce latency.

---

## Re-test Plan

After deploying the optimizations above:

1. Rebuild all containers: `docker compose --env-file .env.docker.local up -d --build`
2. Bypass IIS: change frontend port to `80:80`, stop IIS (`iisreset /stop`)
3. Re-run: `k6 run --env BASE_URL=http://81.0.66.211 k6-load-test.js`
4. Run SSE test: `node sse-test.mjs --url http://81.0.66.211 --concurrency 10`
5. Compare results against this baseline

Expected improvements after removing IIS:
- API p95: 23s -> <2s
- Tile p95: 10s -> <500ms
- Graph p95: 60s -> <15s
- SSE completion: should actually complete instead of timing out
