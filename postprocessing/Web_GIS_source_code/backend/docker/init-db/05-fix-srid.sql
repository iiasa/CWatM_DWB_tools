--
-- Fix calib_stations SRID from 0 to 4326 (WGS84)
-- The local database has SRID=0 on calib_stations geometry; subbasins already has SRID=4326
--

UPDATE calib_stations
SET geom = ST_SetSRID(geom, 4326)
WHERE geom IS NOT NULL AND ST_SRID(geom) = 0;

--
-- Reset sequences so TypeORM auto-increment works correctly after seeded data
--

SELECT setval('calib_stations_id_seq', COALESCE((SELECT MAX(id) FROM calib_stations), 0) + 1, false);
SELECT setval('subbasins_id_seq', COALESCE((SELECT MAX(id) FROM subbasins), 0) + 1, false);
