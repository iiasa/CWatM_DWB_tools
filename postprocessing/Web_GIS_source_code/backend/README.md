# DWB Backend

Nest.js backend application for DWB project.

## Prerequisites

- Node.js (v18 or higher)
- Yarn package manager
- PostgreSQL database
- Nodemon (installed globally)

## Installation

1. Install nodemon globally:
```bash
yarn global add nodemon
```

2. Install dependencies:
```bash
yarn
```

3. Copy environment variables:
```bash
cp env.example .env
```

4. Update `.env` file with your database credentials and other configurations.

## Running the application

### Development
```bash
yarn start:dev
```
This will start the server with nodemon for automatic reloading on file changes.

### Production
```bash
yarn build
yarn start:prod
```

## API Endpoints

- `GET /` - Hello World endpoint
- `GET /health` - Health check endpoint

The server runs on port **8085** by default.

## Project Structure

```
src/
├── common/           # Shared utilities, decorators, filters
├── config/           # Configuration files
├── modules/          # Feature modules (to be added)
├── app.controller.ts # Main application controller
├── app.module.ts     # Main application module
├── app.service.ts    # Main application service
└── main.ts          # Application entry point
```

## Subbasin topology (upstream traversal)

Subbasin-to-subbasin topology lives in the `subbasins` Postgres table:

- `Inflow_ID` (`varchar`) — space-separated list of geocodes (e.g. `'G0037 G0073'`). Each token names an **upstream** group: water from those groups drains *into* this row. `NULL` marks a headwater.
- `ID_2` (`varchar`) — the geocode of the row itself. The same geocode is reused across regions (the bare code `G0037` appears as `ID_2` on ~4 different subbasins in Upper, Drava, Tisa, Middle…), so resolving an `Inflow_ID` token requires joining on `ID_2` **and** matching the `Subbasin` region. Empirically that rule resolves 634 of 640 tokens to a unique parent (~99%); the remaining 6 are cross-region geocode collisions that don't represent real hydrological parents and are ignored.
- `Subbasin` (`varchar`) — region label (Upper / Drava / Sava / Tisa / Morava / Middle / Lower); used to disambiguate the geocode match above.

Topology is already populated by the existing seed (`docker/init-db/04-seed-subbasins.sql`); no migration or pipeline change is needed to use it.

### `GET /subbasins/:id/upstream`

Returns the transitive upstream set for the given subbasin id (the root is excluded).

```json
{ "root": 1, "upstream_ids": [36, 70, 289, 320, 351, 429, 469, 497], "count": 8, "truncated": false }
```

Implementation notes:

- Uses a recursive CTE that follows `Inflow_ID` → `ID_2` joins upward.
- The CTE uses `UNION` (not `UNION ALL`) so each id is added at most once — this keeps the working set bounded against the heavy fan-out in this dataset (one geocode resolves to up to 7 rows, and confluences can have 16 direct parents), and it naturally terminates on any cycles in the topology data.
- Results are cached for 5 minutes (shared cache with `findAllRaw`/`findAllAsFeatureCollection`); a headwater simply returns `upstream_ids: []`. The `truncated` field is reserved for future use and is currently always `false`.

## Available Scripts

- `yarn start` - Start the application
- `yarn start:dev` - Start in development mode with hot reload
- `yarn start:debug` - Start in debug mode
- `yarn build` - Build the application
- `yarn test` - Run unit tests
- `yarn test:e2e` - Run end-to-end tests
- `yarn lint` - Run ESLint
- `yarn format` - Format code with Prettier
