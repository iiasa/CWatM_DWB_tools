--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: calib_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calib_stations (
    id integer NOT NULL,
    geom public.geometry,
    no integer,
    lat numeric(10,8),
    lon numeric(11,8),
    "Subbasin" character varying(255),
    "Idall" character varying(255),
    "ID_numeric" integer,
    "ID" character varying(255),
    "Provider" character varying(255),
    "River" character varying(255),
    "Station" character varying(255),
    "DrainArPro" numeric(15,2),
    "DrainArLDD" numeric(15,2),
    "EnoughQdat" integer,
    "CatchmentA" numeric(15,2),
    "SamplingFr" numeric(10,4),
    "Inflow" numeric(15,2),
    "Inflow_ID" character varying(255),
    "KGE_cal" numeric(5,4),
    "KGE_val" numeric(5,4),
    "NSE_cal" numeric(5,4),
    "NSE_val" numeric(5,4),
    "Val_Start" timestamp without time zone,
    "Val_End" timestamp without time zone,
    "Cal_Start" timestamp without time zone,
    "Cal_End" timestamp without time zone,
    "Country" character varying(255)
);


--
-- Name: calib_stations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calib_stations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calib_stations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calib_stations_id_seq OWNED BY public.calib_stations.id;


--
-- Name: subbasins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subbasins (
    id integer NOT NULL,
    geom public.geometry(MultiPolygon,4326),
    "Subbasin" character varying,
    "Idall" character varying,
    "ID_2" character varying,
    "Provider" character varying,
    "River" character varying,
    "Station" character varying,
    "Inflow_ID" character varying,
    merged_ids character varying,
    area double precision,
    gridcode numeric,
    no numeric,
    "ID_numeric" numeric,
    "Country" character varying,
    lat numeric,
    lon numeric,
    "DrainArPro" numeric,
    "DrainArLDD" numeric,
    "EnoughQdat" numeric,
    "Val_Start" timestamp without time zone,
    "Val_End" timestamp without time zone,
    "Cal_Start" timestamp without time zone,
    "Cal_End" timestamp without time zone,
    "CatchmentA" numeric,
    "SamplingFr" numeric,
    "Inflow" numeric,
    "KGE_cal" numeric,
    "KGE_val" numeric,
    "NSE_cal" numeric,
    "NSE_val" numeric,
    "ID" numeric
);


--
-- Name: subbasins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subbasins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subbasins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subbasins_id_seq OWNED BY public.subbasins.id;


--
-- Name: calib_stations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calib_stations ALTER COLUMN id SET DEFAULT nextval('public.calib_stations_id_seq'::regclass);


--
-- Name: subbasins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subbasins ALTER COLUMN id SET DEFAULT nextval('public.subbasins_id_seq'::regclass);


--
-- Name: calib_stations calib_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calib_stations
    ADD CONSTRAINT calib_stations_pkey PRIMARY KEY (id);


--
-- Name: subbasins subbasins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subbasins
    ADD CONSTRAINT subbasins_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--


