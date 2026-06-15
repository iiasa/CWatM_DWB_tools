-- =========================================================================
-- Reconnect orphaned outlet subbasins to their downstream parents
-- =========================================================================
--
-- Several subbasins in the seed data are "orphaned outlets": the upstream
-- end of a complete subtree whose downstream connection is not expressed
-- anywhere. Their ID_2 geocode is not referenced by any same-group row's
-- Inflow_ID, and they are not the upstream end of any
-- subbasin_cross_group_links edge. As a result, walking upstream from any
-- other root never enters their subtree, and the highlighted upstream set
-- is incomplete.
--
-- We fix this by appending each orphan's geocode to the Inflow_ID of the
-- nearest downstream parent within the same Subbasin group. The closure
-- table built by 09-rebuild-upstream-closure.sql (which runs after this
-- file) then includes the previously-orphaned subtree.
--
-- IDEMPOTENT: each UPDATE skips rows where the geocode is already present,
-- so re-running this file produces no change.
--
-- WHEN TO RUN
--   - On a fresh DB seed, this file runs automatically after 04-…sql and
--     before 09-…sql.
--   - On an existing deployment, run this file once, then 09-…sql to
--     rebuild the closure:
--         psql -d DWB -f docker/init-db/08-fix-orphan-outlets.sql
--         psql -d DWB -f docker/init-db/09-rebuild-upstream-closure.sql
-- =========================================================================

-- Sava: DRAZEVAC (id=448, G0094, KOLUBARA) -> Sava outlet SREMSKA MITROVICA (id=434)
UPDATE public.subbasins
SET "Inflow_ID" = trim("Inflow_ID" || ' G0094')
WHERE id = 434
  AND ("Inflow_ID" IS NULL OR position('G0094' in "Inflow_ID") = 0);

-- Tisa: Balint (id=518, G0095, Bega) -> Tisa outlet SENTA (id=519)
UPDATE public.subbasins
SET "Inflow_ID" = trim(COALESCE("Inflow_ID" || ' ', '') || 'G0095')
WHERE id = 519
  AND ("Inflow_ID" IS NULL OR position('G0095' in "Inflow_ID") = 0);

-- Upper: Fischa (id=143, G0146) -> Upper Danube outlet Korneuburg (id=134)
UPDATE public.subbasins
SET "Inflow_ID" = trim("Inflow_ID" || ' G0146')
WHERE id = 134
  AND ("Inflow_ID" IS NULL OR position('G0146' in "Inflow_ID") = 0);

-- Upper: Schwechat (id=194, G0199) -> Upper Danube outlet Korneuburg (id=134)
UPDATE public.subbasins
SET "Inflow_ID" = trim("Inflow_ID" || ' G0199')
WHERE id = 134
  AND ("Inflow_ID" IS NULL OR position('G0199' in "Inflow_ID") = 0);

-- Lower: Ceatal Izmail (id=533) is the system terminus (Black Sea outlet).
-- No fix; the diagnostic in 09-…sql whitelists this id.
