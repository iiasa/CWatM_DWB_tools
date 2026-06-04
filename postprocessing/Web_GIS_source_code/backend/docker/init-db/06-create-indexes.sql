--
-- 06-create-indexes.sql
--
-- Runs after 02-create-tables.sql + seeds on fresh containers
-- (docker-entrypoint-initdb.d executes alphabetically).
--
-- For a LIVE database where the data is already loaded, run this file
-- manually and swap "CREATE INDEX" -> "CREATE INDEX CONCURRENTLY".
-- CONCURRENTLY cannot run inside an implicit transaction block, so it is
-- unsuitable for the init-db path here, but inside init-db the database is
-- single-user and plain CREATE INDEX is safe.
--

-- =========================================================================
-- Phase 1 — Spatial + btree indexes on the two main tables.
-- =========================================================================

-- Spatial GIST for MVT ST_Intersects and any ST_DWithin lookups.
CREATE INDEX IF NOT EXISTS idx_subbasins_geom_gist
    ON public.subbasins USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_calib_stations_geom_gist
    ON public.calib_stations USING GIST (geom);

-- Composite btree for the recursive upstream CTE join:
--   JOIN subbasins next_s ON next_s."ID_2" = parsed.geocode
--                        AND next_s."Subbasin" = u."Subbasin"
-- Leading "Subbasin" gives the planner a cheap equality probe; "ID_2"
-- continues the match without a second index lookup.
CREATE INDEX IF NOT EXISTS idx_subbasins_subbasin_id2
    ON public.subbasins ("Subbasin", "ID_2");

-- Subbasins filter columns used elsewhere in the service.
CREATE INDEX IF NOT EXISTS idx_subbasins_inflow_id
    ON public.subbasins ("Inflow_ID");

CREATE INDEX IF NOT EXISTS idx_subbasins_country
    ON public.subbasins ("Country");

-- calib_stations filter columns (calib-stations.service.ts findBy*).
CREATE INDEX IF NOT EXISTS idx_calib_stations_subbasin
    ON public.calib_stations ("Subbasin");

CREATE INDEX IF NOT EXISTS idx_calib_stations_country
    ON public.calib_stations ("Country");

CREATE INDEX IF NOT EXISTS idx_calib_stations_provider
    ON public.calib_stations ("Provider");

CREATE INDEX IF NOT EXISTS idx_calib_stations_inflow_id
    ON public.calib_stations ("Inflow_ID");

-- Expression indexes for case-insensitive LIKE/ILIKE filters
-- (findByStationName / findByRiver use LOWER(...) LIKE LOWER(...)).
CREATE INDEX IF NOT EXISTS idx_calib_stations_station_lower
    ON public.calib_stations (lower("Station"));

CREATE INDEX IF NOT EXISTS idx_calib_stations_river_lower
    ON public.calib_stations (lower("River"));

-- =========================================================================
-- Phase 2 — Materialized upstream closure table.
-- =========================================================================
--
-- (subbasin_id, ancestor_id) means "ancestor_id is upstream of subbasin_id".
-- Populated once at seed time by the same recursive CTE the service uses,
-- so /subbasins/:id/upstream becomes a single indexed SELECT.
--
-- NOTE: The fill below is INTRA-GROUP ONLY. Cross-basin-group edges live
-- in subbasin_cross_group_links (created by 07-cross-group-links.sql),
-- orphan-outlet Inflow_ID corrections live in 08-fix-orphan-outlets.sql, and
-- the closure is rebuilt with both branches by 09-rebuild-upstream-closure.sql,
-- which runs after those files on fresh seeds. To force a rebuild on an
-- existing deployment, run 09-…sql manually.
--
-- Rebuild whenever the subbasins table is re-seeded:
--   TRUNCATE public.subbasin_upstream;
--   INSERT INTO public.subbasin_upstream ... (the block below)

CREATE TABLE IF NOT EXISTS public.subbasin_upstream (
    subbasin_id integer NOT NULL,
    ancestor_id integer NOT NULL,
    PRIMARY KEY (subbasin_id, ancestor_id)
);

INSERT INTO public.subbasin_upstream (subbasin_id, ancestor_id)
WITH RECURSIVE upstream(root, id, "Subbasin", "Inflow_ID") AS (
    SELECT s.id, s.id, s."Subbasin", s."Inflow_ID"
    FROM public.subbasins s

    UNION

    SELECT u.root, n.id, n."Subbasin", n."Inflow_ID"
    FROM upstream u
    CROSS JOIN LATERAL (
        SELECT DISTINCT trim(gc) AS geocode
        FROM unnest(string_to_array(u."Inflow_ID", ' ')) AS gc
        WHERE trim(gc) <> ''
    ) parsed
    JOIN public.subbasins n
      ON n."ID_2" = parsed.geocode
     AND n."Subbasin" = u."Subbasin"
    WHERE u."Inflow_ID" IS NOT NULL
)
SELECT root, id
FROM upstream
WHERE root <> id
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_subbasin_upstream_root
    ON public.subbasin_upstream (subbasin_id);

-- =========================================================================
-- Phase 3 — Pre-simplified geometry for low-zoom MVT tiles.
-- =========================================================================
-- At z < 8, ST_AsMVTGeom on full polygons over hundreds of subbasins is the
-- dominant cost. A generated column populated by ST_SimplifyPreserveTopology
-- at ~500 m (0.005°) tolerance is invisible at these zooms but cuts the
-- vertex count dramatically, making the tile query several times faster.
-- ST_SimplifyPreserveTopology is IMMUTABLE, so STORED works.

-- TypeORM's introspection table — created upfront so the bootstrap doesn't
-- ever trip with `relation "typeorm_metadata" does not exist`.
CREATE TABLE IF NOT EXISTS public.typeorm_metadata (
    type varchar NOT NULL,
    database varchar,
    schema varchar,
    "table" varchar,
    name varchar,
    value text
);

-- geom_simplified is a regular column (not GENERATED) so TypeORM's
-- `synchronize: true` reflects what's in the entity exactly and never
-- decides to drop it. It is kept in sync via the trigger below.
ALTER TABLE public.subbasins
    ADD COLUMN IF NOT EXISTS geom_simplified geometry(MultiPolygon, 4326);

UPDATE public.subbasins
SET geom_simplified = ST_SimplifyPreserveTopology(geom, 0.005)
WHERE geom IS NOT NULL
  AND (geom_simplified IS NULL OR NOT ST_Equals(geom_simplified, ST_SimplifyPreserveTopology(geom, 0.005)));

CREATE OR REPLACE FUNCTION public.subbasins_set_geom_simplified()
RETURNS trigger AS $$
BEGIN
  IF NEW.geom IS NULL THEN
    NEW.geom_simplified := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.geom IS DISTINCT FROM OLD.geom THEN
    NEW.geom_simplified := ST_SimplifyPreserveTopology(NEW.geom, 0.005);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subbasins_geom_simplified_trg ON public.subbasins;
CREATE TRIGGER subbasins_geom_simplified_trg
    BEFORE INSERT OR UPDATE OF geom ON public.subbasins
    FOR EACH ROW EXECUTE FUNCTION public.subbasins_set_geom_simplified();

CREATE INDEX IF NOT EXISTS idx_subbasins_geom_simplified_gist
    ON public.subbasins USING GIST (geom_simplified);

-- =========================================================================
-- Phase 4 — Surface-water vector layers (rivers + water_bodies).
-- =========================================================================
-- Tables created in 02a-create-hydro-tables.sql, seeded by 04a/04b. Guarded
-- with IF NOT EXISTS so this file stays safe to re-run, and "to_regclass"
-- guarded so it is a no-op if the hydro tables were not created (e.g. an
-- older deployment without the 02a file).

DO $$
BEGIN
  IF to_regclass('public.rivers') IS NOT NULL THEN
    -- Spatial GIST for the MVT ST_Intersects bbox query (TilesService).
    CREATE INDEX IF NOT EXISTS idx_rivers_geom_gist
        ON public.rivers USING GIST (geom);
    -- btree on Strahler order: low-zoom MVT tiles filter ord_stra >= N to
    -- show only major channels when zoomed out.
    CREATE INDEX IF NOT EXISTS idx_rivers_ord_stra
        ON public.rivers (ord_stra);
    ANALYZE public.rivers;
  END IF;

  IF to_regclass('public.water_bodies') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_water_bodies_geom_gist
        ON public.water_bodies USING GIST (geom);
    ANALYZE public.water_bodies;
  END IF;
END $$;

-- Keep planner statistics fresh after building all the indexes/tables.
ANALYZE public.subbasins;
ANALYZE public.calib_stations;
ANALYZE public.subbasin_upstream;
