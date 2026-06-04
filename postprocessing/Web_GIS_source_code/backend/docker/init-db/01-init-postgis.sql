-- Enable PostGIS extensions on first database initialization
-- The postgis/postgis image includes the binaries; this ensures they're activated
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
