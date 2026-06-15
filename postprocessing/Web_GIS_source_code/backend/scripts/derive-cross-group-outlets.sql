-- =========================================================================
-- Cross-basin-group outlet derivation (REVIEW-ONLY)
-- =========================================================================
--
-- Finds candidate (outlet_id -> downstream_id) pairs that link each
-- tributary basin group to the Danube mainstem group it drains into.
--
-- HOW IT WORKS
--   1. An "outlet" is a subbasin whose ID_2 is NEVER referenced by any
--      other subbasin's Inflow_ID within the same basin group — i.e. it
--      has no in-group downstream neighbour, so it must drain across
--      the group boundary.
--   2. For each outlet, find subbasins in OTHER basin groups whose
--      geometry is within 500 m (widen to 2000 m if a group produces no
--      candidate). Order by distance.
--
-- HOW TO USE
--   psql -d DWB -f dwb-backend/scripts/derive-cross-group-outlets.sql
--   (or run inside any SQL client connected to the DWB database)
--
--   Inspect the result. The expected mapping is:
--     Sava   -> Lower
--     Drava  -> Middle
--     Tisa   -> Middle
--     Morava -> Upper
--     Upper  -> Middle
--     Middle -> Lower
--   For each upstream_group pick the row whose downstream_river is on
--   the Danube mainstem (or matches the expected target group above).
--   Paste the chosen (outlet_id, downstream_id) values into
--   docker/init-db/07-cross-group-links.sql, then run
--   docker/init-db/09-rebuild-upstream-closure.sql.
-- =========================================================================

WITH referenced AS (
    SELECT DISTINCT s."Subbasin" AS grp, trim(gc) AS geocode
    FROM public.subbasins s,
         unnest(string_to_array(s."Inflow_ID", ' ')) AS gc
    WHERE trim(gc) <> ''
),
outlets AS (
    SELECT s.id        AS outlet_id,
           s."Subbasin" AS grp,
           s."ID_2",
           s."River",
           s."Country",
           s.geom
    FROM public.subbasins s
    LEFT JOIN referenced r
           ON r.grp = s."Subbasin"
          AND r.geocode = s."ID_2"
    WHERE r.geocode IS NULL
)
SELECT o.outlet_id,
       o.grp           AS upstream_group,
       o."ID_2"        AS upstream_geocode,
       o."River"       AS upstream_river,
       o."Country"     AS upstream_country,
       n.id            AS downstream_id,
       n."Subbasin"    AS downstream_group,
       n."ID_2"        AS downstream_geocode,
       n."River"       AS downstream_river,
       n."Country"     AS downstream_country,
       ROUND(ST_Distance(o.geom::geography, n.geom::geography)::numeric, 1)
                       AS dist_m
FROM outlets o
JOIN public.subbasins n
  ON n."Subbasin" <> o.grp
 AND ST_DWithin(o.geom::geography, n.geom::geography, 500)
ORDER BY o.grp, dist_m;
