-- =========================================================================
-- Cross-basin-group upstream links
-- =========================================================================
--
-- Explicit hydrological links between basin groups (Sava, Drava, Tisa,
-- Morava, Upper, Middle, Lower). The recursive upstream CTEs in
-- subbasins.service.ts and 06-create-indexes.sql use these rows to hop
-- across group boundaries when computing the upstream set of a clicked
-- subbasin.
--
-- WHY A SEPARATE TABLE
--   Inflow_ID is a space-separated list of ID_2 geocodes, but geocodes
--   are reused across basin groups (e.g. G0037 exists in Upper, Drava
--   and Tisa). Storing the cross-group link by primary key removes that
--   ambiguity without re-introducing the geocode collision that the
--   intra-group join filter exists to prevent.
--
-- POPULATING THE INSERTS
--   1. Run dwb-backend/scripts/derive-cross-group-outlets.sql against
--      the live DB. Expect ~6 candidate rows (one per non-Lower group).
--   2. For each upstream_group, pick the row whose downstream_river is
--      the Danube mainstem (or matches the expected target group below)
--      and uncomment a matching INSERT.
--   3. Re-run docker/init-db/09-rebuild-upstream-closure.sql.
--
-- EXPECTED MAPPING
--   Sava   -> Lower
--   Drava  -> Middle
--   Tisa   -> Middle
--   Morava -> Upper
--   Upper  -> Middle
--   Middle -> Lower
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.subbasin_cross_group_links (
    upstream_subbasin_id   integer NOT NULL REFERENCES public.subbasins(id),
    downstream_subbasin_id integer NOT NULL REFERENCES public.subbasins(id),
    note text,
    PRIMARY KEY (upstream_subbasin_id, downstream_subbasin_id),
    CHECK (upstream_subbasin_id <> downstream_subbasin_id)
);

CREATE INDEX IF NOT EXISTS idx_xgroup_down
    ON public.subbasin_cross_group_links (downstream_subbasin_id);

-- -------------------------------------------------------------------------
-- Cross-group edges (FILL IN BEFORE RUNNING 08-...sql)
-- -------------------------------------------------------------------------
-- Uncomment and replace <…> placeholders with the IDs picked from the
-- derivation query. Each row reads as: "the outlet of <upstream_group>
-- flows into <downstream_group>".

INSERT INTO public.subbasin_cross_group_links
    (upstream_subbasin_id, downstream_subbasin_id, note)
VALUES
    (434, 603, 'Sava confluence with Danube (Belgrade)'),
    (320, 365, 'Drava confluence with Danube'),
    (519, 365, 'Tisa confluence with Danube'),
    (256, 134, 'Morava confluence with Danube (Devin / Bratislava)'),
    (134, 375, 'Upper Danube into Middle Danube'),
    (365, 603, 'Middle Danube into Lower Danube')
ON CONFLICT DO NOTHING;
