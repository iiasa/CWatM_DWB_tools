
# DWB Load Testing

Load test scripts for validating the DWB platform under 50 concurrent users.

## Prerequisites

### k6 (main load test)
```bash
# Windows
winget install Grafana.k6

# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

### Node.js 18+ (SSE test)
Required for the SSE-specific test script.

## Scripts

### `k6-load-test.js` — Full workflow load test

Simulates 50 concurrent users over 10 minutes performing a mix of:
- Map load (stations + subbasins GeoJSON + MVT tiles)
- Pan/zoom (MVT tile requests at higher zoom levels)
- Raster toggle (COG tile requests via TiTiler)
- Subbasin click (60%) — Python subprocess graph data
- Station click (20%) — Python subprocess graph data
- Point click (20%) — SSE stream from FastAPI sidecar

```bash
# Basic run
k6 run k6-load-test.js

# With JSON output for analysis
k6 run --out json=results.json k6-load-test.js

# Custom server URL
k6 run --env BASE_URL=http://your-server k6-load-test.js
```

### `sse-test.mjs` — Point-graph SSE concurrent test

Tests the SSE streaming endpoint specifically, since k6 doesn't natively support SSE.

```bash
# Default: 5 concurrent connections
node sse-test.mjs

# 10 concurrent connections
node sse-test.mjs --concurrency 10

# Custom server
node sse-test.mjs --url http://your-server --concurrency 10
```

## Running the Test

**Important:** Run from a machine separate from the VM to avoid self-loading.

### Step 1: Start monitoring on the VM

Open 3 PowerShell sessions on the VM:

```powershell
# Terminal 1: Container resources
docker stats

# Terminal 2: Backend logs
docker logs dwb-backend -f --since 1m

# Terminal 3: DB connections
watch -n 5 'docker exec dwb-db psql -U postgres -d DWB -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"'
```

### Step 2: Run the k6 test

```bash
k6 run k6-load-test.js
```

### Step 3: Run the SSE test (separately)

```bash
node sse-test.mjs --concurrency 10
```

### Step 4: Document results

Fill in `LOAD-TEST-RESULTS.md` with the collected data.

## Customization

Edit the test data arrays in `k6-load-test.js` to match your actual data:
- `SUBBASIN_IDS` — valid subbasin IDs from your database
- `STATION_NAMES` — valid station names
- `POINT_COORDS` — coordinates within the Danube basin
- `MVT_TILES` — tile coordinates covering your area of interest
