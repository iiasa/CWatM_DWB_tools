-- =========================================================================
-- Rebuild upstream closure (subbasin_upstream) with cross-group edges
-- =========================================================================
--
-- Wipes and re-populates public.subbasin_upstream using the recursive CTE
-- that now follows:
--   (a) intra-group geocode chains via Inflow_ID / ID_2 (original logic)
--   (b) explicit cross-group hops via subbasin_cross_group_links (new)
--
-- WHEN TO RUN
--   - On a fresh DB seed, this file runs automatically after 06-…sql,
--     07-…sql and 08-…sql, so the initial closure produced by 06-…sql is
--     immediately overwritten with the cross-group-aware version that also
--     picks up the orphan-outlet Inflow_ID corrections from 08-…sql.
--   - On an existing deployment, run this once after editing
--     07-cross-group-links.sql or 08-fix-orphan-outlets.sql:
--         psql -d DWB -f docker/init-db/09-rebuild-upstream-closure.sql
--
-- SAFETY
--   - Idempotent: re-running produces the same rows.
--   - During the brief rebuild window the service's closureTableReady
--     probe falls back to the runtime recursive CTE, so /upstream
--     requests continue to work (just slower).
-- =========================================================================

TRUNCATE public.subbasin_upstream;

INSERT INTO public.subbasin_upstream (subbasin_id, ancestor_id)
WITH RECURSIVE upstream(root, id, "Subbasin", "Inflow_ID") AS (
    SELECT s.id, s.id, s."Subbasin", s."Inflow_ID"
    FROM public.subbasins s

    UNION

    SELECT u.root, n.id, n."Subbasin", n."Inflow_ID"
    FROM upstream u
    JOIN public.subbasins n ON n.id IN (
        -- (a) intra-group, by geocode
        SELECT next_s.id
        FROM unnest(string_to_array(u."Inflow_ID", ' ')) AS gc
        JOIN public.subbasins next_s
          ON next_s."ID_2" = trim(gc)
         AND next_s."Subbasin" = u."Subbasin"
        WHERE trim(gc) <> ''

        UNION

        -- (b) cross-group, by explicit PK link
        SELECT l.upstream_subbasin_id
        FROM public.subbasin_cross_group_links l
        WHERE l.downstream_subbasin_id = u.id
    )
)
SELECT root, id
FROM upstream
WHERE root <> id
ON CONFLICT DO NOTHING;

-- =========================================================================
-- Orphan-outlet diagnostic
-- =========================================================================
-- A subbasin is reachable from any downstream root iff its ID_2 appears in
-- some same-group row's Inflow_ID, OR it sits at the upstream end of a
-- subbasin_cross_group_links edge. Anything that fails both is an
-- "orphaned outlet" — a connected subtree disconnected from the rest of the
-- network, which produces incomplete upstream highlights in the UI.
--
-- This block re-derives the orphan set after the rebuild and raises a
-- WARNING if any unaccounted orphans remain. Expected legitimate terminus:
-- Ceatal Izmail (id=533) — the Black Sea outlet, whitelisted below.
-- =========================================================================

DO $$
DECLARE
  orphan_count integer;
  orphan_list  text;
BEGIN
  WITH refs AS (
    SELECT trim(gc) AS code, s."Subbasin" AS grp
    FROM public.subbasins s,
         unnest(string_to_array(s."Inflow_ID", ' ')) AS gc
    WHERE s."Inflow_ID" IS NOT NULL AND trim(gc) <> ''
  ),
  outlets AS (
    SELECT s.id, s."Subbasin", s."ID_2", s."River", s."Station"
    FROM public.subbasins s
    LEFT JOIN refs r ON r.code = s."ID_2" AND r.grp = s."Subbasin"
    WHERE r.code IS NULL
  ),
  unaccounted AS (
    SELECT o.* FROM outlets o
    LEFT JOIN public.subbasin_cross_group_links l
      ON l.upstream_subbasin_id = o.id
    WHERE l.upstream_subbasin_id IS NULL
      AND o.id <> 533  -- Ceatal Izmail: legitimate Black Sea terminus
  )
  SELECT count(*),
         string_agg(format('id=%s %s/%s', id, "Subbasin", "Station"), ', ')
    INTO orphan_count, orphan_list
    FROM unaccounted;

  IF orphan_count > 0 THEN
    RAISE WARNING 'subbasin topology: % unlinked orphan outlets remain: %',
                  orphan_count, orphan_list;
  END IF;
END $$;
