# River Network & Water Bodies — data sources, licenses, regeneration

The map's **River Network** and **Water Bodies** layers are vector data stored
in PostGIS (`public.rivers`, `public.water_bodies`) and served as MVT tiles.
This documents where the data comes from, its license, and how to regenerate
the committed seed files. (Acceptance criterion AC7: reproducible pipeline.)

## Sources

| Layer | Dataset | Version | Download | Geometry / CRS |
|-------|---------|---------|----------|----------------|
| Rivers | **HydroRIVERS** (WWF / HydroSHEDS), Europe & Middle East pack | v1.0 | <https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_eu_shp.zip> (~68 MB) | LineString, EPSG:4326 |
| Water bodies | **HydroLAKES** (WWF / HydroSHEDS), polygon pack | v1.0 | <https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip> (~820 MB) | (Multi)Polygon, EPSG:4326 |

Product pages: <https://www.hydrosheds.org/products/hydrorivers> ·
<https://www.hydrosheds.org/products/hydrolakes>

## Licenses

- **HydroRIVERS v1.0** — freely available for scientific, educational and
  commercial use under the HydroSHEDS license (see the HydroSHEDS Technical
  Documentation). Attribution to HydroSHEDS/WWF requested.
- **HydroLAKES v1.0** — **Creative Commons Attribution (CC-BY) 4.0**.
  Attribution is **required** and is surfaced in the frontend (legend / about
  panel): *"Water bodies: HydroLAKES v1.0 (Messager et al. 2016), CC-BY 4.0."*

## What we keep

Both datasets are **clipped to the Danube basin** (the dissolved
`ST_Union` of the `subbasins` table) before loading.

**Rivers** — the **full Danube network, all Strahler orders** (`ORD_STRA >= 1`;
1 = tiny headwater stream, ~8–9 = Danube main stem), ~58k reaches. Columns kept:
`hyriv_id`, `next_down`, `ord_stra`, `ord_flow`, `dis_av_cms` (avg discharge
m³/s), `length_km`. `ord_stra` drives line width in the map (AC3).

Visible detail is **tiered by zoom** in the backend rivers MVT endpoint
(`TilesService.riversMinOrderForZoom` in `src/tiles/tiles.service.ts`), so the
zoomed-out view shows only major rivers and smaller rivers progressively appear
as the user zooms in:

| zoom (z) | min `ord_stra` shown |
|----------|----------------------|
| ≤ 6      | 6 (biggest rivers only) |
| 7–8      | 5 |
| 9–10     | 4 |
| 11–12    | 3 |
| 13       | 2 |
| ≥ 14     | 1 (full detail, small streams) |

The seed floor is configurable via `MIN_ORD_STRA` (default `1` = ingest
everything). Raising it shrinks the committed seed but caps how much detail the
zoom tiers can ever reveal.

**Water bodies** — all clipped lakes/reservoirs. Columns kept: `hylak_id`,
`lake_name`, `lake_type` (1 = lake, 2 = reservoir, 3 = regulated), `lake_area`
(km²), `depth_avg`, `vol_total`, `shore_len`.

The full source downloads are used only at prep time and are **not** committed
— only the clipped, filtered subsets are.

## Files in this directory

| File | Role |
|------|------|
| `02a-create-hydro-tables.sql` | `CREATE TABLE rivers` / `water_bodies` (runs after `02-`, before seeds) |
| `04a-seed-rivers.sql.gz` | Clipped HydroRIVERS `INSERT`s (gzipped; Postgres init gunzips automatically) |
| `04b-seed-water-bodies.sql.gz` | Clipped HydroLAKES `INSERT`s (gzipped) |
| `06-create-indexes.sql` | GIST indexes on `geom` + btree on `rivers.ord_stra` (Phase 4 block) |

`docker-entrypoint-initdb.d` runs these alphabetically on a **fresh** database,
so a Docker/VM rebuild loads and indexes the data automatically — no network,
no GDAL, no manual step.

## Regenerating the seed files

Only needed when refreshing the data or changing the filter. Requires Docker
and the running PostGIS container (`dwb-db`).

```bash
# from dwb-backend/
./docker/scripts/prepare-hydro-data.sh
#   MIN_ORD_STRA=6 ./docker/scripts/prepare-hydro-data.sh   # leaner rivers
#   MIN_ORD_STRA=4 ./docker/scripts/prepare-hydro-data.sh   # more detail
```

The script downloads + unzips the sources (cached in `dwb-backend/.hydro-cache/`),
builds the basin cutline, clips/loads via the OSGeo GDAL image, and dumps
gzipped `INSERT`-only SQL into this directory. Commit the two regenerated
`.sql.gz` files.

## Verify after a fresh rebuild

```sql
SELECT count(*), ST_SRID(geom), GeometryType(geom) FROM rivers GROUP BY 2,3;
SELECT count(*), ST_SRID(geom), GeometryType(geom) FROM water_bodies GROUP BY 2,3;
-- expect non-zero counts, SRID 4326, LINESTRING / MULTIPOLYGON
\di idx_rivers_geom_gist idx_rivers_ord_stra idx_water_bodies_geom_gist
```

## Citations

- Lehner, B., Grill G. (2013). *Global river hydrography and network routing.*
  HydroSHEDS / HydroRIVERS.
- Messager, M.L., Lehner, B., Grill, G., Nedeva, I., Schmitt, O. (2016).
  *Estimating the volume and age of water stored in global lakes.* Nature
  Communications. HydroLAKES.
