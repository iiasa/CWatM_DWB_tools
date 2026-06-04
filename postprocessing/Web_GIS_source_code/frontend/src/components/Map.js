import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Map from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Cluster from 'ol/source/Cluster';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Point } from 'ol/geom';
import { Feature } from 'ol';
import { Style, Circle, Fill, Stroke, Text, Icon } from 'ol/style';
import { Select } from 'ol/interaction';
import { click } from 'ol/events/condition';
import Overlay from 'ol/Overlay';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVTFormat from 'ol/format/MVT';
import 'ol/ol.css';
import config from '../config/app.config';
import InfoIcon from './InfoIcon';
import { LAYER_INFO_CONFIG } from '../config/layerLegendConfig';
import HoverTool from './HoverTool';
import MapControlStack from './MapControlStack';
import DateRangePicker from './DateRangePicker';
import Legend from './Legend';
import { calcSubbasinsBBox } from '../utils/bounds';
import apiService from '../services/api.service';
import './Map.css';

// Registry for all raster layers - centralized configuration
// tileKey maps to COG directory names in data/tif/cog/
// stateKey is used by Legend component for visibility mapping
// static: true marks a time-independent layer (single COG, no time suffix) — e.g. DEM
const WMS_LAYER_REGISTRY = [
  // Categorical land-cover layer (CGLS-LC100 2019). Static like DEM (one COG,
  // ignored by the time slider, AC5). zIndex 4 sits below the data rasters
  // (DEM=5…) and above the river/lake vectors (2–3) so it never obscures
  // stations, subbasins or the on-top overlays (AC7).
  { key: 'lulc',         tileKey: 'lulc',          stateKey: 'isLulcVisible',         id: 'lulc-layer',          displayName: 'Land Use / Land Cover',    uiName: 'Land Use / Land Cover',        zIndex: 4, static: true, group: 'land'    },
  { key: 'dem',          tileKey: 'dem',           stateKey: 'isDemVisible',          id: 'dem-layer',           displayName: 'Digital Elevation Model',  uiName: 'Elevation (DEM)',              zIndex: 5, static: true, group: 'terrain' },
  { key: 'discharge',    tileKey: 'discharge',     stateKey: 'isDischargeVisible',    id: 'discharge-layer',     displayName: 'Discharge Monthly Avg',    uiName: 'Discharge',                    zIndex: 6,              group: 'outputs' },
  { key: 'etref',        tileKey: 'etref',         stateKey: 'isEtrefVisible',        id: 'etref-layer',         displayName: 'ETRef Monthly Avg',        uiName: 'Reference Evapotranspiration', zIndex: 7,              group: 'inputs'  },
  { key: 'iceMelt',      tileKey: 'icemelt',       stateKey: 'isIceMeltVisible',      id: 'ice-melt-layer',      displayName: 'IceMelt Monthly Avg',      uiName: 'Ice Melt',                     zIndex: 8,              group: 'inputs'  },
  { key: 'rain',         tileKey: 'rain',          stateKey: 'isRainVisible',         id: 'rain-layer',          displayName: 'Rain Monthly Avg',         uiName: 'Rain',                         zIndex: 9,              group: 'inputs'  },
  { key: 'runoff',       tileKey: 'runoff',        stateKey: 'isRunoffVisible',       id: 'runoff-layer',        displayName: 'Runoff Monthly Avg',       uiName: 'Runoff',                       zIndex: 10,             group: 'outputs' },
  { key: 'snow',         tileKey: 'snow',          stateKey: 'isSnowVisible',         id: 'snow-layer',          displayName: 'Snow Monthly Avg',         uiName: 'Snow',                         zIndex: 11,             group: 'inputs'  },
  { key: 'snowFraction', tileKey: 'snowfraction',  stateKey: 'isSnowFractionVisible', id: 'snow-fraction-layer', displayName: 'SnowFraction Monthly Avg', uiName: 'Snow Fraction',                zIndex: 12,             group: 'inputs'  },
  { key: 'snowMelt',     tileKey: 'snowmelt',      stateKey: 'isSnowMeltVisible',     id: 'snow-melt-layer',     displayName: 'SnowMelt Monthly Avg',     uiName: 'Snow Melt',                    zIndex: 13,             group: 'inputs'  },
  { key: 'totalETWB',    tileKey: 'totalet',       stateKey: 'isTotalETWBVisible',    id: 'total-et-wb-layer',   displayName: 'TotalET_WB Monthly Avg',   uiName: 'Total ET Water Bodies',       zIndex: 14,             group: 'outputs' },
  { key: 'tws',          tileKey: 'tws',           stateKey: 'isTwsVisible',          id: 'tws-layer',           displayName: 'TWS Monthly Avg',          uiName: 'Total Water Storage',          zIndex: 15,             group: 'outputs' },
];

// Vector (MVT) overlay layers served from PostGIS, like the subbasins layer.
// Unlike the raster WMS layers these are lines/polygons styled client-side.
// zIndex sits ABOVE subbasins (1) and BELOW station markers (20) so rivers
// draw over the basins but stations stay clickable on top (AC5).
//   mvt      -> backend /tiles/mvt/:layer route name
//   stateKey -> Legend visibility key (see layerLegendConfig.js)
const VECTOR_LAYER_REGISTRY = [
  { key: 'rivers',      stateKey: 'isRiverNetworkVisible', id: 'rivers-layer',       uiName: 'River Network', mvt: 'rivers',       zIndex: 2, group: 'water' },
  { key: 'waterBodies', stateKey: 'isWaterBodiesVisible',  id: 'water-bodies-layer', uiName: 'Water Bodies',  mvt: 'water_bodies', zIndex: 3, group: 'water' },
];

// Collapsible groups shown in the Layers panel, in display order. Each layer in
// the registries above is assigned to one of these via its `group` key. The
// grouping is the source of truth for the panel (the legend's `category` field
// is not reused because it tags Total ET as an input rather than an output).
const LAYER_GROUPS = [
  { id: 'inputs',  label: 'Inputs' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'water',   label: 'Surface Water' },
  { id: 'land',    label: 'Land Cover' },
];

// Flat list of every panel layer (raster + vector), used to render the groups.
const ALL_LAYERS = [...WMS_LAYER_REGISTRY, ...VECTOR_LAYER_REGISTRY];

// Small chevron used in the collapsible group headers. Inherits color via
// currentColor and is rotated by CSS to indicate expanded/collapsed state.
const ChevronIcon = ({ className }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// IDs of the vector overlays — excluded from the Select interaction so clicks
// fall through to subbasins/stations beneath them (AC5).
const NON_SELECTABLE_LAYER_IDS = new Set(VECTOR_LAYER_REGISTRY.map(l => l.id));

const buildStationMarkerDataUrl = (color) => {
  const outlineColor = '#000000';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <g fill="none">
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M11.474 21.85L12 21l-.526.85zM12 21l.525.85c-.322.2-.73.2-1.051 0l-.003-.001l-.006-.004l-.02-.013a7.993 7.993 0 0 1-.311-.206a17.706 17.706 0 0 1-.841-.616a20.485 20.485 0 0 1-2.531-2.332C5.933 16.677 4 13.695 4 10c0-4.539 3.592-8 8-8c4.408 0 8 3.461 8 8c0 3.695-1.933 6.677-3.762 8.678a20.487 20.487 0 0 1-2.53 2.332a17.706 17.706 0 0 1-1.085.778a7.993 7.993 0 0 1-.068.044l-.02.013l-.006.004h-.002c0 .001-.002.002-.527-.849zM9 10a3 3 0 1 1 6 0a3 3 0 0 1-6 0z"
          fill="${color}"
          stroke="${outlineColor}"
          stroke-width="1"
          stroke-linejoin="round"
        />
      </g>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const STATION_MARKER_ICON_SRC = buildStationMarkerDataUrl('#0066cc');
const SELECTED_STATION_MARKER_ICON_SRC = buildStationMarkerDataUrl('#ffd700');

// Create station marker with specific color based on Subbasin
const createStationMarkerBySubbasin = (subbasinName) => {
  const colorMap = {
    'Drava': '#FF0000',    // Red
    'Lower': '#0000FF',    // Blue
    'Middle': '#00FF00',   // Green
    'Morava': '#FF00FF',   // Magenta
    'Sava': '#FFA500',     // Orange
    'Tisa': '#00FFFF',     // Cyan
    'Upper': '#FFFF00'     // Yellow
  };
  const color = colorMap[subbasinName] || '#0066cc'; // Default to blue if not found
  return buildStationMarkerDataUrl(color);
};

// Color mapping for different Subbasin values
const getSubbasinColor = (subbasinName) => {
  const colorMap = {
    'Drava': '#FF0000',    // Red
    'Lower': '#0000FF',    // Blue
    'Middle': '#00FF00',   // Green
    'Morava': '#FF00FF',   // Magenta
    'Sava': '#FFA500',     // Orange
    'Tisa': '#00FFFF',     // Cyan
    'Upper': '#FFFF00'     // Yellow
  };
  return colorMap[subbasinName] || '#FF0000'; // Default to red if not found
};

const createSubbasinStyle = (isHovered = false, isSelected = false, subbasinName = null, isUpstream = false) => {
  const styles = [];
  const baseColor = getSubbasinColor(subbasinName);

  // Thin solid black outline beneath the colored classification stroke
  styles.push(new Style({
    stroke: new Stroke({
      color: '#000000',
      width: 0.5
    }),
    zIndex: 0
  }));

  // If selected, use golden style regardless of hover (root selection wins over upstream)
  if (isSelected) {
    styles.push(new Style({
      fill: new Fill({
        color: 'rgba(255, 215, 0, 0.3)' // Golden fill for selected
      }),
      stroke: new Stroke({
        color: '#ffd700', // Golden border for selected
        width: 3
      }),
      zIndex: 12 // Highest z-index for selected
    }));
    return styles;
  }

  // Upstream highlight (teal) — distinct from selected gold, sits above base strokes
  if (isUpstream) {
    styles.push(new Style({
      fill: new Fill({
        color: 'rgba(0, 137, 123, 0.3)' // Teal fill for upstream
      }),
      stroke: new Stroke({
        color: '#00897B', // Teal border
        width: 2.5
      }),
      zIndex: 11
    }));
    return styles;
  }
  
  if (isHovered) {
    // Drop shadow layer - larger, darker outline behind
    styles.push(new Style({
      stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.3)', // Dark shadow
        width: 8,
        lineDash: [4, 4]
      }),
      zIndex: 9
    }));
    
    // Buffer layer - white outline for separation
    styles.push(new Style({
      stroke: new Stroke({
        color: 'rgba(255, 255, 255, 0.8)', // White buffer
        width: 5,
        lineDash: [4, 4]
      }),
      zIndex: 10
    }));
  }
  
  // Main layer
  styles.push(new Style({
    fill: new Fill({
      color: 'rgba(255, 0, 0, 0)' // Transparent fill
    }),
    stroke: new Stroke({
      color: baseColor,
      width: isHovered ? 3 : 2, // Thicker border on hover
      lineDash: [4, 4]
    }),
    zIndex: isHovered ? 11 : 1 // Lift effect - higher z-index on hover
  }));
  
  return styles;
};

const MapComponent = ({
  stationsData,
  subbasinsData,
  onStationSelect,
  onSubbasinSelect,
  onSubbasinSelectStart,
  onMapReady,
  onPointSelect,
  onPointSelectStart,
  coverageBbox,
  isLoadingPoint,
  processingElapsedTime,
  processingEstimatedTime,
  onCancelLoading,
  onDateRangeChange,
  onTogglePanel,
  isPanelHidden,
  isChartPanelOpen,
  isChartsExpanded,
  onToggleChartsExpanded
}) => {
  const mapRef = useRef();
  const mapInstance = useRef();
  const popupRef = useRef();
  const [activeLayer, setActiveLayer] = useState('osm');
  const [hasFittedToSubbasins, setHasFittedToSubbasins] = useState(false);
  
  // Stabilize subbasins data to prevent unnecessary recalculations
  const stableSubbasins = useMemo(() => subbasinsData, [subbasinsData]);
  
  // Extract and normalize features from subbasins data.
  // Handles three shapes:
  //   1. GeoJSON FeatureCollection (from legacy /subbasins/geojson) — passed through.
  //   2. Array of rows with a `geom` field (legacy /subbasins) — wrap geometry.
  //   3. Array of catalog rows with `lat`/`lon` only (new /subbasins/catalog) —
  //      synthesize Point features so bbox estimation still works; polygons
  //      themselves are rendered by the MVT layer.
  const stableFeatures = useMemo(() => {
    if (!stableSubbasins) return [];

    if (stableSubbasins?.type === 'FeatureCollection' && stableSubbasins.features) {
      return stableSubbasins.features;
    } else if (Array.isArray(stableSubbasins)) {
      return stableSubbasins.map(subbasin => {
        if (subbasin.geom) {
          let geometry;
          if (typeof subbasin.geom === 'string') {
            try {
              geometry = JSON.parse(subbasin.geom);
            } catch (e) {
              return null;
            }
          } else {
            geometry = subbasin.geom;
          }
          return { geometry, ...subbasin };
        }
        if (Number.isFinite(Number(subbasin.lat)) && Number.isFinite(Number(subbasin.lon))) {
          return {
            geometry: { type: 'Point', coordinates: [Number(subbasin.lon), Number(subbasin.lat)] },
            ...subbasin,
          };
        }
        return null;
      }).filter(f => f !== null);
    }

    return [];
  }, [stableSubbasins]);

  // Calculate bbox from stable features
  const subbasinsBBox = useMemo(() => {
    if (!stableFeatures?.length) return null;
    return calcSubbasinsBBox(stableFeatures);
  }, [stableFeatures]);
  
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(false);
  const [isBaseMapPanelOpen, setIsBaseMapPanelOpen] = useState(false);

  // Global time state for the date range picker (current month)
  const [globalTime, setGlobalTime] = useState('2005-01-01');

  // Konsolidovano stanje vidljivosti za sve WMS layere
  const [layerVisibility, setLayerVisibility] = useState(() => {
    const init = {};
    WMS_LAYER_REGISTRY.forEach(l => { init[l.key] = false; });
    VECTOR_LAYER_REGISTRY.forEach(l => { init[l.key] = false; });
    return init;
  });

  // Per-layer opacity (0.0–1.0). Defaults to 0.7 to match the previous hardcoded value.
  const [layerOpacity, setLayerOpacity] = useState(() => {
    const init = {};
    WMS_LAYER_REGISTRY.forEach(l => { init[l.key] = 0.7; });
    // Vector overlays look best fully opaque (lines/fills carry their own alpha).
    VECTOR_LAYER_REGISTRY.forEach(l => { init[l.key] = 1.0; });
    return init;
  });

  // Expand/collapse state for the layer groups in the panel. All collapsed by default.
  const [expandedGroups, setExpandedGroups] = useState(() =>
    Object.fromEntries(LAYER_GROUPS.map(g => [g.id, false]))
  );

  // Info bar state
  const [mouseCoordinates, setMouseCoordinates] = useState([0, 0]);
  const [scaleBarWidth, setScaleBarWidth] = useState(100);
  const [scaleBarDistance, setScaleBarDistance] = useState('0 km');
  
  // Marker tool state
  const [isMarkerMode, setIsMarkerMode] = useState(false);
  
  // Processing status animation state
  const [showProcessingStatus, setShowProcessingStatus] = useState(false);
  const [isProcessingClosing, setIsProcessingClosing] = useState(false);
  // Countdown timer state for point processing
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [initialSeconds, setInitialSeconds] = useState(0);
  
  // Hover state for subbasins
  const [hoveredSubbasin, setHoveredSubbasin] = useState(null);
  const hoveredSubbasinRef = useRef(null);

  // Selected subbasin state to keep it yellow
  const [selectedSubbasin, setSelectedSubbasin] = useState(null);
  const selectedSubbasinRef = useRef(null);

  // Upstream selection: toggle + set of highlighted upstream ids.
  // Ref mirrors the Set so the MVT style callback (which closes over [] deps)
  // can read it without forcing a re-render of the layer.
  const [isUpstreamMode, setIsUpstreamMode] = useState(false);
  const [upstreamIds, setUpstreamIds] = useState(() => new Set());
  const upstreamIdsRef = useRef(upstreamIds);
  // Guards stale fetches when the user clicks subbasins faster than the network responds.
  const upstreamFetchSeq = useRef(0);

  // Sync refs for use in MVT style functions
  useEffect(() => { hoveredSubbasinRef.current = hoveredSubbasin; }, [hoveredSubbasin]);
  useEffect(() => { selectedSubbasinRef.current = selectedSubbasin; }, [selectedSubbasin]);
  useEffect(() => { upstreamIdsRef.current = upstreamIds; }, [upstreamIds]);

  // Check if any RASTER (WMS) layer is visible. Used only to dim the subbasins
  // layer beneath the rasters — the vector overlays (rivers/water bodies) must
  // NOT trigger this dimming, so they are intentionally excluded here.
  const isAnyWmsLayerVisible = useMemo(() => {
    return WMS_LAYER_REGISTRY.some(l => layerVisibility[l.key]);
  }, [layerVisibility]);

  // Any layer at all (raster or vector) — drives the legend auto-show.
  const isAnyLayerVisible = useMemo(() => {
    return Object.values(layerVisibility).some(v => v);
  }, [layerVisibility]);

  // Auto-show the legend when any layer is enabled; auto-hide when all are off.
  // Manually hiding via the toolbar button is respected because no boolean transition
  // occurs while the user keeps toggling layers within an already-non-empty set.
  useEffect(() => {
    setIsLegendVisible(isAnyLayerVisible);
  }, [isAnyLayerVisible]);

  // Helper functions
  const wgsToView = (lon, lat) => fromLonLat([lon, lat]);
  
  // Format time as "Xm Ys" or "Xs"
  const formatTime = (seconds) => {
    if (seconds < 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins}min ${secs}s`;
    }
    return `${secs}s`;
  };
  const viewToWgs = useCallback((coord3857) => {
    const [lon, lat] = toLonLat(coord3857);
    return { lon, lat };
  }, []);
  const asNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  // Custom zoom functions
  const handleZoomIn = useCallback(() => {
    if (mapInstance.current) {
      const view = mapInstance.current.getView();
      const currentZoom = view.getZoom();
      view.animate({
        zoom: currentZoom + 1,
        duration: 300
      });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapInstance.current) {
      const view = mapInstance.current.getView();
      const currentZoom = view.getZoom();
      view.animate({
        zoom: currentZoom - 1,
        duration: 300
      });
    }
  }, []);


  // Calculate scale bar
  const calculateScaleBar = (map) => {
    const view = map.getView();
    const resolution = view.getResolution();
    const projection = view.getProjection();
    const metersPerUnit = projection.getMetersPerUnit();
    const pointResolution = resolution * metersPerUnit;
    
    // Target width in pixels for the scale bar
    const maxWidth = 100;
    const maxDistance = pointResolution * maxWidth;
    
    // Find a nice round number for the distance
    let distance;
    let unit;
    
    if (maxDistance >= 1000) {
      // Use kilometers
      distance = maxDistance / 1000;
      const magnitude = Math.pow(10, Math.floor(Math.log10(distance)));
      distance = Math.floor(distance / magnitude) * magnitude;
      
      if (distance === 0) distance = magnitude;
      
      unit = 'km';
    } else {
      // Use meters
      distance = maxDistance;
      const magnitude = Math.pow(10, Math.floor(Math.log10(distance)));
      distance = Math.floor(distance / magnitude) * magnitude;
      
      if (distance === 0) distance = magnitude;
      
      unit = 'm';
      
      // Convert back to km if it's a nice round number >= 1km
      if (distance >= 1000 && distance % 1000 === 0) {
        distance = distance / 1000;
        unit = 'km';
      }
    }
    
    // Calculate the actual pixel width for this distance
    const distanceInMeters = unit === 'km' ? distance * 1000 : distance;
    const width = Math.round(distanceInMeters / pointResolution);
    
    return {
      width,
      distance: `${distance} ${unit}`
    };
  };

  // Styles
  const createStationStyle = (subbasinName = null) => {
    const iconSrc = subbasinName ? createStationMarkerBySubbasin(subbasinName) : STATION_MARKER_ICON_SRC;
    return new Style({
      image: new Icon({
        src: iconSrc,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        imgSize: [24, 24],
        scale: 1.4
      })
    });
  };

  const createSelectedStationStyle = () =>
    new Style({
      image: new Icon({
        src: SELECTED_STATION_MARKER_ICON_SRC,
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        imgSize: [24, 24],
        scale: 1.5
      })
    });

  const createSelectedSubbasinStyle = () =>
    new Style({
      fill: new Fill({
        color: 'rgba(255, 215, 0, 0.3)'
      }),
      stroke: new Stroke({
        color: '#ffd700',
        width: 3
      })
    });

  // Create cluster style function
  const createClusterStyle = (feature) => {
    const size = feature.get('features').length;
    
    if (size === 1) {
      // Single station - show as regular station marker with color based on Subbasin
      const stationFeature = feature.get('features')[0];
      const station = stationFeature.get('station');
      const subbasinName = station?.Subbasin;
      return createStationStyle(subbasinName);
    } else {
      // Cluster - show as circle with number
      // Scale radius based on cluster size, but cap it
      const radius = Math.min(15 + Math.sqrt(size) * 3, 40);
      
      return new Style({
        image: new Circle({
          radius: radius,
          fill: new Fill({
            color: 'rgba(0, 102, 204, 0.7)'
          }),
          stroke: new Stroke({
            color: '#000000',
            width: 2
          })
        }),
        text: new Text({
          text: size.toString(),
          fill: new Fill({
            color: '#ffffff'
          }),
          font: 'bold 14px Arial',
          textBaseline: 'middle'
        })
      });
    }
  };

  // Create layers
  const createStationsLayer = (stations) => {
    const vectorSource = new VectorSource();

    stations.forEach((s) => {
      const lat = asNumber(s.lat);
      const lon = asNumber(s.lon);
      if (lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
        const feature = new Feature({
          geometry: new Point(wgsToView(lon, lat)),
          station: s,
          stationId: s.id
        });
        const subbasinName = s.Subbasin;
        feature.setStyle(createStationStyle(subbasinName));
        vectorSource.addFeature(feature);
      }
    });

    // Create cluster source
    const clusterSource = new Cluster({
      distance: 100, // Distance in pixels within which features will be clustered
      minDistance: 60, // Minimum distance between clusters
      source: vectorSource
    });

    return new VectorLayer({
      source: clusterSource,
      style: createClusterStyle,
      zIndex: 20
    });
  };

  const createSubbasinsLayer = useCallback(() => {
    const backendUrl = config.backend?.url || 'http://localhost:8085';
    return new VectorTileLayer({
      source: new VectorTileSource({
        format: new MVTFormat({ featureClass: Feature }),
        url: `${backendUrl}/tiles/mvt/subbasins/{z}/{x}/{y}.pbf`,
      }),
      style: (feature) => {
        const subbasinName = feature.get('Subbasin');
        const subbasinId = feature.get('id');
        const isHovered = subbasinId === hoveredSubbasinRef.current;
        const isSelected = subbasinId === selectedSubbasinRef.current;
        const isUpstream = upstreamIdsRef.current.has(subbasinId);
        return createSubbasinStyle(isHovered, isSelected, subbasinName, isUpstream);
      },
      zIndex: 1,
      declutter: false,
    });
  }, []);

  // River Network (HydroRIVERS MVT). Line width scales with Strahler order
  // (ord_stra) so the Danube main stem is visibly thicker than tributaries (AC3).
  const createRiversLayer = useCallback(() => {
    const backendUrl = config.backend?.url || 'http://localhost:8085';
    return new VectorTileLayer({
      source: new VectorTileSource({
        format: new MVTFormat({ featureClass: Feature }),
        url: `${backendUrl}/tiles/mvt/rivers/{z}/{x}/{y}.pbf`,
      }),
      style: (feature) => {
        const order = feature.get('ord_stra') || 5;
        // order 5 -> ~1.8px, Danube main stem (order 8-9) -> ~4.5-5.4px
        const width = Math.max(0.6, (order - 3) * 0.9);
        return new Style({
          stroke: new Stroke({ color: '#1565C0', width }),
        });
      },
      visible: false,
      zIndex: 2,
      declutter: false,
    });
  }, []);

  // Water Bodies (HydroLAKES MVT) — filled blue polygons, visible at all zooms (AC4).
  const createWaterBodiesLayer = useCallback(() => {
    const backendUrl = config.backend?.url || 'http://localhost:8085';
    return new VectorTileLayer({
      source: new VectorTileSource({
        format: new MVTFormat({ featureClass: Feature }),
        url: `${backendUrl}/tiles/mvt/water_bodies/{z}/{x}/{y}.pbf`,
      }),
      style: () => new Style({
        fill: new Fill({ color: 'rgba(33, 150, 243, 0.55)' }),
        stroke: new Stroke({ color: '#1565C0', width: 0.8 }),
      }),
      visible: false,
      zIndex: 3,
      declutter: false,
    });
  }, []);

  const createBaseLayers = () => {
    const googleLayer = new TileLayer({
      source: new XYZ({
        url: config.map.googleSatelliteUrl,
        attributions: '© Google',
        crossOrigin: 'anonymous',
        tilePixelRatio: 1,
        transition: 0
      }),
      visible: false
    });
    googleLayer.set('id', 'base-google');
    googleLayer.set('name', 'Google Satellite');

    const osmLayer = new TileLayer({
      source: new OSM({
        url: config.map.osmTileUrl,
        crossOrigin: 'anonymous',
        tilePixelRatio: 1,
        transition: 0
      }),
      visible: true
    });
    osmLayer.set('id', 'base-osm');
    osmLayer.set('name', 'OpenStreetMap');

    return { googleLayer, osmLayer };
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    const { googleLayer, osmLayer } = createBaseLayers();

    const map = new Map({
      target: mapRef.current,
      layers: [googleLayer, osmLayer],
      controls: [], // Remove default controls including zoom
    });

    mapInstance.current = map;
    mapInstance.current.googleLayer = googleLayer;
    mapInstance.current.osmLayer = osmLayer;

    const popupOverlay = new Overlay({
      element: popupRef.current,
      positioning: 'center-left',
      offset: [40, 0],
      stopEvent: false,
      autoPan: { animation: { duration: 250 } }
    });
    map.addOverlay(popupOverlay);
    mapInstance.current.popupOverlay = popupOverlay;

    const selectInteraction = new Select({
      condition: click,
      // Exclude the river/water-body overlays so clicks pass through to the
      // subbasins/stations underneath them (AC5).
      layers: (layer) => !NON_SELECTABLE_LAYER_IDS.has(layer.get('id')),
      style: (feature) => {
        // Check if it's a cluster
        const features = feature.get('features');
        if (features && features.length > 1) {
          // Cluster selected - highlight it
          const size = features.length;
          const radius = Math.min(15 + Math.sqrt(size) * 3, 40);
          return new Style({
            image: new Circle({
              radius: radius,
              fill: new Fill({
                color: 'rgba(255, 215, 0, 0.7)' // Golden color for selected cluster
              }),
              stroke: new Stroke({
                color: '#000000',
                width: 2
              })
            }),
            text: new Text({
              text: size.toString(),
              fill: new Fill({
                color: '#ffffff'
              }),
              font: 'bold 14px Arial',
              textBaseline: 'middle'
            })
          });
        } else if (feature.get('stationId') || (features && features.length === 1 && features[0].get('stationId'))) {
          return createSelectedStationStyle();
        } else if (feature.get('subbasinId') || feature.get('Subbasin')) {
          return createSelectedSubbasinStyle();
        }
        return null;
      }
    });

    selectInteraction.on('select', (event) => {
      const selectedFeatures = event.selected;
      if (selectedFeatures.length > 0) {
        const feature = selectedFeatures[0];
        
        // Check if it's a cluster
        const clusteredFeatures = feature.get('features');
        
        if (clusteredFeatures && clusteredFeatures.length > 1) {
          // It's a cluster with multiple features - zoom in to expand it
          const extent = feature.getGeometry().getExtent();
          const view = map.getView();
          const currentZoom = view.getZoom();
          
          // Zoom in by 2 levels
          view.fit(extent, {
            duration: 500,
            padding: [100, 100, 100, 100],
            maxZoom: currentZoom + 2
          });
          
          // Clear selection after zoom
          selectInteraction.getFeatures().clear();
          return;
        }
        
        // Single feature or extract from cluster
        let actualFeature = feature;
        if (clusteredFeatures && clusteredFeatures.length === 1) {
          actualFeature = clusteredFeatures[0];
        }
        
        const stationId = actualFeature.get('stationId');
        const subbasinId = feature.get('subbasinId') || feature.get('id');

        if (stationId) {
          // Clear subbasin selection when station is clicked
          setSelectedSubbasin(null);
          
          const stationData = actualFeature.get('station');
          const coordView = actualFeature.getGeometry().getCoordinates();
          const { lon, lat } = viewToWgs(coordView);

          const stationInfo = {
            ...stationData,
            lat,
            lon
          };
          
          if (onStationSelect) {
            onStationSelect(stationInfo);
          }
        } else if (subbasinId) {
          // MVT features have flat properties (no nested 'subbasin' key)
          const props = feature.getProperties();
          const { geometry: _geom, ...subbasinData } = props;

          // Set this subbasin as selected
          setSelectedSubbasin(subbasinId);

          // Auto-enable upstream mode and fetch its transitive upstream set.
          // Clicking any subbasin always (re)computes upstream for the new root.
          setIsUpstreamMode(true);
          fetchUpstreamFor(subbasinId);

          // Show loader immediately when subbasin is clicked
          if (onSubbasinSelectStart) {
            onSubbasinSelectStart();
          }

          if (onSubbasinSelect) {
            onSubbasinSelect(subbasinData);
          }
        }
      } else {
        // Clear subbasin + upstream highlights when clicking on empty area
        setSelectedSubbasin(null);
        setIsUpstreamMode(false);
        upstreamFetchSeq.current++;
        setUpstreamIds(new Set());
      }
    });

    map.on('pointermove', (event) => {
      const features = map.getFeaturesAtPixel(event.pixel) || [];
      map.getViewport().style.cursor = features.length > 0 ? 'pointer' : 'default';
    });

    map.addInteraction(selectInteraction);
    mapInstance.current.selectInteraction = selectInteraction;

    // Add mouse move listener for coordinates
    map.on('pointermove', (event) => {
      const coordinate = event.coordinate;
      const [lon, lat] = toLonLat(coordinate);
      setMouseCoordinates([parseFloat(lon.toFixed(3)), parseFloat(lat.toFixed(3))]);
      
      // Check for subbasin hover
      const features = map.getFeaturesAtPixel(event.pixel);
      let newHoveredSubbasin = null;
      
      if (features && features.length > 0) {
        for (const feature of features) {
          const subbasinId = feature.get('subbasinId') || feature.get('id');
          if (subbasinId && feature.get('Subbasin') && subbasinId !== selectedSubbasin) {
            // Only allow hover on non-selected subbasins (check Subbasin attr to distinguish from stations)
            newHoveredSubbasin = subbasinId;
            break;
          }
        }
      }
      
      setHoveredSubbasin(newHoveredSubbasin);
    });

    // Add view change listener for scale bar
    const updateScaleBar = () => {
      const scaleInfo = calculateScaleBar(map);
      setScaleBarWidth(scaleInfo.width);
      setScaleBarDistance(scaleInfo.distance);
    };

    map.getView().on('change:resolution', updateScaleBar);
    map.getView().on('change:center', updateScaleBar);
    
    // Initial scale bar calculation
    updateScaleBar();

    // Add clearSelectedSubbasin function to map instance
    mapInstance.current.clearSelectedSubbasin = () => {
      setSelectedSubbasin(null);
    };

    // Clear all on-map selections (subbasin highlight, upstream highlights, station highlight, point marker)
    mapInstance.current.clearAllSelections = () => {
      setSelectedSubbasin(null);
      setIsUpstreamMode(false);
      upstreamFetchSeq.current++;
      setUpstreamIds(new Set());
      if (mapInstance.current.selectInteraction) {
        mapInstance.current.selectInteraction.getFeatures().clear();
      }
      if (mapInstance.current.markerSource) {
        mapInstance.current.markerSource.clear();
      }
    };

    // Notify parent that map is ready
    if (onMapReady) {
      onMapReady(mapInstance.current);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.setTarget(null);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load stations
  useEffect(() => {
    if (!mapInstance.current || !stationsData || stationsData.length === 0) return;

    const existingLayer = mapInstance.current.stationsLayer;
    if (existingLayer) {
      mapInstance.current.removeLayer(existingLayer);
    }

    const stationsLayer = createStationsLayer(stationsData);
    stationsLayer.set('id', 'stations-layer');
    stationsLayer.set('name', 'Calibration Stations');
    mapInstance.current.addLayer(stationsLayer);
    mapInstance.current.stationsLayer = stationsLayer;
  }, [stationsData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate bounds from stable bbox
  const calculateSubbasinsBounds = useCallback(() => {
    if (!subbasinsBBox) return null;

    // Convert BBox [minLon, minLat, maxLon, maxLat] to old format for compatibility
    return {
      minLon: subbasinsBBox[0],
      minLat: subbasinsBBox[1],
      maxLon: subbasinsBBox[2],
      maxLat: subbasinsBBox[3],
      centerLon: (subbasinsBBox[0] + subbasinsBBox[2]) / 2,
      centerLat: (subbasinsBBox[1] + subbasinsBBox[3]) / 2
    };
  }, [subbasinsBBox]);

  // Fit map to subbasins bounds with viewport-aware padding
  const fitMapToSubbasins = useCallback((bounds) => {
    if (!mapInstance.current || !bounds) return;

    const view = mapInstance.current.getView();
    const extent = [
      wgsToView(bounds.minLon, bounds.minLat)[0],
      wgsToView(bounds.minLon, bounds.minLat)[1],
      wgsToView(bounds.maxLon, bounds.maxLat)[0],
      wgsToView(bounds.maxLon, bounds.maxLat)[1]
    ];

    // Add geometric padding around the bounds
    const geoPadding = 0.15;
    const width = extent[2] - extent[0];
    const height = extent[3] - extent[1];
    const paddedExtent = [
      extent[0] - width * geoPadding,
      extent[1] - height * geoPadding,
      extent[2] + width * geoPadding,
      extent[3] + height * geoPadding
    ];

    // Viewport-aware pixel padding: [top, right, bottom, left]
    // Accounts for search bar (top), map tools (right), bottom bar + time slider (bottom)
    const mapSize = mapInstance.current.getSize() || [800, 600];
    const isSmallScreen = mapSize[0] < 768;
    const pixelPadding = isSmallScreen
      ? [40, 40, 50, 20]
      : [80, 70, 80, 20];

    view.fit(paddedExtent, {
      duration: 0,
      padding: pixelPadding
    });
  }, []);

  // Zoom to home view
  const handleZoomHome = useCallback(() => {
    if (mapInstance.current && subbasinsBBox) {
      const bounds = calculateSubbasinsBounds();
      if (bounds) {
        fitMapToSubbasins(bounds);
      }
    }
  }, [subbasinsBBox, calculateSubbasinsBounds, fitMapToSubbasins]);

  // Initialize MVT subbasins layer (once on mount)
  useEffect(() => {
    if (!mapInstance.current) return;

    const subbasinsLayer = createSubbasinsLayer();
    subbasinsLayer.set('id', 'subbasins-layer');
    subbasinsLayer.set('name', 'Subbasins');
    mapInstance.current.addLayer(subbasinsLayer);
    mapInstance.current.subbasinsLayer = subbasinsLayer;

    return () => {
      if (mapInstance.current?.subbasinsLayer) {
        mapInstance.current.removeLayer(mapInstance.current.subbasinsLayer);
        mapInstance.current.subbasinsLayer = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize the vector overlay layers (River Network + Water Bodies) once.
  // Stored as `${key}Layer` so toggleLayerVisibility / handleOpacityChange work
  // for them exactly like the raster layers.
  useEffect(() => {
    if (!mapInstance.current) return;

    const created = VECTOR_LAYER_REGISTRY.map((cfg) => {
      const layer = cfg.key === 'rivers' ? createRiversLayer() : createWaterBodiesLayer();
      layer.set('id', cfg.id);
      layer.set('name', cfg.uiName);
      layer.setVisible(!!layerVisibility[cfg.key]);
      mapInstance.current.addLayer(layer);
      mapInstance.current[`${cfg.key}Layer`] = layer;
      return layer;
    });

    return () => {
      if (!mapInstance.current) return;
      created.forEach((l) => mapInstance.current.removeLayer(l));
      VECTOR_LAYER_REGISTRY.forEach((cfg) => { mapInstance.current[`${cfg.key}Layer`] = null; });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit map to subbasins bounds (driven by GeoJSON data, not MVT layer)
  useEffect(() => {
    if (!mapInstance.current || hasFittedToSubbasins || !subbasinsBBox) return;

    const bounds = calculateSubbasinsBounds();
    if (bounds) {
      setTimeout(() => {
        fitMapToSubbasins(bounds);
        setHasFittedToSubbasins(true);
      }, 100);
    }
  }, [subbasinsBBox, hasFittedToSubbasins, calculateSubbasinsBounds, fitMapToSubbasins]);

  // Re-render subbasin styles on hover, selection, or upstream-set changes
  useEffect(() => {
    if (!mapInstance.current?.subbasinsLayer) return;
    mapInstance.current.subbasinsLayer.changed();
  }, [hoveredSubbasin, selectedSubbasin, upstreamIds]);

  // Update subbasin layer opacity based on WMS layers visibility
  useEffect(() => {
    if (!mapInstance.current || !mapInstance.current.subbasinsLayer) return;

    const layer = mapInstance.current.subbasinsLayer;
    const opacity = isAnyWmsLayerVisible ? 0.3 : 1.0;
    layer.setOpacity(opacity);
  }, [layerVisibility, isAnyWmsLayerVisible]);

  // Inicijalizacija svih WMS layera (jednom pri mount-u)
  useEffect(() => {
    if (!mapInstance.current) return;

    WMS_LAYER_REGISTRY.forEach((layerConfig) => {
      const layer = createWmsLayer(layerConfig, globalTime, layerOpacity[layerConfig.key]);
      mapInstance.current.addLayer(layer);
      mapInstance.current[`${layerConfig.key}Layer`] = layer;
    });

    return () => {
      if (!mapInstance.current) return;
      WMS_LAYER_REGISTRY.forEach((lc) => {
        const layer = mapInstance.current[`${lc.key}Layer`];
        if (layer) mapInstance.current.removeLayer(layer);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Marker tool functions
  const toggleMarkerMode = () => {
    setIsMarkerMode(!isMarkerMode);

    if (!isMarkerMode) {
      console.log('Marker mode activated - Click on map to place marker');
    } else {
      console.log('Marker mode deactivated');
    }
  };

  // Fetch the transitive upstream set for a subbasin and apply it as the highlight set.
  // Uses a sequence guard so rapid clicks discard stale responses.
  const fetchUpstreamFor = useCallback(async (subbasinId) => {
    if (subbasinId == null) return;
    const seq = ++upstreamFetchSeq.current;
    try {
      const res = await apiService.getUpstreamSubbasins(subbasinId);
      if (seq !== upstreamFetchSeq.current) return; // stale
      const ids = Array.isArray(res?.upstream_ids) ? res.upstream_ids : [];
      setUpstreamIds(new Set(ids));
    } catch (err) {
      if (seq !== upstreamFetchSeq.current) return;
      console.warn(`Failed to load upstream subbasins for ${subbasinId}:`, err.message);
      setUpstreamIds(new Set());
    }
  }, []);

  // Toolbar toggle. ON with a current selection → fetch upstream immediately.
  // OFF → clear upstream highlights but keep the gold root + chart panel.
  const toggleUpstreamMode = useCallback(() => {
    setIsUpstreamMode((prev) => {
      const next = !prev;
      if (next) {
        if (selectedSubbasinRef.current != null) {
          fetchUpstreamFor(selectedSubbasinRef.current);
        }
      } else {
        upstreamFetchSeq.current++; // invalidate any in-flight fetch
        setUpstreamIds(new Set());
      }
      return next;
    });
  }, [fetchUpstreamFor]);

  // Handle marker mode clicks and disable selection
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    // Create marker layer if it doesn't exist
    if (!map.markerLayer) {
      const markerSource = new VectorSource();
      const markerLayer = new VectorLayer({
        source: markerSource,
        style: new Style({
          image: new Icon({
            src: '/photos/pin.png',
            scale: 0.1,
            anchor: [0.5, 1.0], // Anchor point at bottom center of pin
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction'
          })
        }),
        zIndex: 10000
      });
      map.addLayer(markerLayer);
      map.markerLayer = markerLayer;
      map.markerSource = markerSource;
    }

    // Enable/disable select interaction based on marker mode
    if (map.selectInteraction) {
      map.selectInteraction.setActive(!isMarkerMode);
    }

    const handleMapClick = (event) => {
      if (!isMarkerMode) return;

      const coordinate = event.coordinate;
      const { lon, lat } = viewToWgs(coordinate);

      // Bbox guard: when the backend reports a coverage bbox, skip placing
      // a marker and skip the loader for clicks clearly outside coverage —
      // Geoportal.js still shows a friendly alert via onPointSelect.
      const outOfBbox =
        coverageBbox &&
        (lat < coverageBbox.lat_min ||
          lat > coverageBbox.lat_max ||
          lon < coverageBbox.lon_min ||
          lon > coverageBbox.lon_max);

      if (!outOfBbox) {
        // Clear previous markers
        map.markerSource.clear();

        // Add new marker
        const markerFeature = new Feature({
          geometry: new Point(coordinate)
        });
        map.markerSource.addFeature(markerFeature);

        // Clear subbasin selection when marker is placed
        setSelectedSubbasin(null);

        // Show loader immediately when marker is placed
        if (onPointSelectStart) {
          onPointSelectStart();
        }

        // Auto-disable the tool once a marker is placed and generation has
        // started — the user re-clicks the toolbar button to pick another point.
        setIsMarkerMode(false);
      }

      // Always notify the parent so it can either load the chart or show
      // a friendly out-of-coverage message based on the same bbox.
      if (onPointSelect) {
        onPointSelect({ lat, lon });
      }
    };

    if (isMarkerMode) {
      map.on('click', handleMapClick);
    }

    return () => {
      map.un('click', handleMapClick);
      // Re-enable selection when component unmounts or mode changes
      if (map.selectInteraction && !isMarkerMode) {
        map.selectInteraction.setActive(true);
      }
    };
  }, [isMarkerMode, viewToWgs, onPointSelect, onPointSelectStart, coverageBbox]);

  // Handle processing status animation - entry and exit
  useEffect(() => {
    if (isLoadingPoint) {
      // Show with entry animation
      setShowProcessingStatus(true);
      setIsProcessingClosing(false);
      const initial = 75;
      setInitialSeconds(initial);
      setRemainingSeconds(initial);
    } else if (showProcessingStatus) {
      // Start exit animation
      setIsProcessingClosing(true);
      // Hide after animation completes
      const timer = setTimeout(() => {
        setShowProcessingStatus(false);
        setIsProcessingClosing(false);
        setRemainingSeconds(0);
        setInitialSeconds(0);
      }, 400); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isLoadingPoint, showProcessingStatus]);

  // Handle countdown timer for point processing
  useEffect(() => {
    if (isLoadingPoint && showProcessingStatus) {
      const interval = setInterval(() => {
        setRemainingSeconds((prev) => {
          // If timer reaches 1s or less and processing is still ongoing, add 3-8s
          if (prev <= 1 && isLoadingPoint) {
            const additionalSeconds = Math.floor(Math.random() * (8 - 3 + 1)) + 3;
            // Update initial seconds to reflect the new total
            setInitialSeconds((prevInitial) => prevInitial + additionalSeconds);
            return prev + additionalSeconds;
          }
          // Decrement timer
          const newValue = prev - 1;
          return Math.max(0, newValue);
        });
      }, 1000); // Update every second

      return () => clearInterval(interval);
    }
  }, [isLoadingPoint, showProcessingStatus]);

  // Layer switcher functions
  const switchLayer = (layerType) => {
    if (!mapInstance.current) return;
    const { googleLayer, osmLayer } = mapInstance.current;
    if (layerType === 'google') {
      googleLayer.setVisible(true);
      osmLayer.setVisible(false);
      setActiveLayer('google');
    } else if (layerType === 'osm') {
      googleLayer.setVisible(false);
      osmLayer.setVisible(true);
      setActiveLayer('osm');
    }
  };

  const toggleLayersPanel = () => setIsLayersPanelOpen(!isLayersPanelOpen);
  const toggleLegend = () => setIsLegendVisible(!isLegendVisible);
  const toggleBaseMapPanel = () => setIsBaseMapPanelOpen(!isBaseMapPanelOpen);


  // Build TiTiler tile URL for a given variable and month.
  // Static layers (e.g. DEM) use a single COG with no time suffix in the filename.
  const buildTileUrl = (tileKey, monthKey, isStatic = false) => {
    const titilerUrl = config.titiler?.url || '/tiles';
    const cogPath = isStatic
      ? `file:///data/cog/${tileKey}/${tileKey}.cog.tif`
      : `file:///data/cog/${tileKey}/${tileKey}_${monthKey}.cog.tif`;
    const cogUrl = encodeURIComponent(cogPath);
    return `${titilerUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${cogUrl}&colormap_name=dwb_${tileKey}`;
  };

  // Danube basin extent in EPSG:3857 (Web Mercator) — prevents tile requests outside data area
  const DANUBE_EXTENT_3857 = [890555.93, 5160979.44, 3319176.15, 6533321.57];

  // Create a tile layer served on-the-fly by TiTiler from COG files
  const createWmsLayer = (layerConfig, time, initialOpacity = 0.7) => {
    const monthKey = layerConfig.static ? null : time.substring(0, 7); // '2005-01-01' -> '2005-01'

    const source = new XYZ({
      url: buildTileUrl(layerConfig.tileKey, monthKey, layerConfig.static),
      crossOrigin: 'anonymous',
      cacheSize: 128, // Limit tile cache to prevent memory bloat during timelapse
    });

    const layer = new TileLayer({
      source,
      visible: false,
      opacity: initialOpacity,
      zIndex: layerConfig.zIndex,
      transition: 250,
      extent: DANUBE_EXTENT_3857,
    });

    layer.set('id', layerConfig.id);
    layer.set('name', layerConfig.displayName);
    return layer;
  };

  // Toggle visibility for any layer by key
  const toggleLayerVisibility = (key) => {
    setLayerVisibility(prev => {
      const newVis = { ...prev, [key]: !prev[key] };
      if (mapInstance.current) {
        const layer = mapInstance.current[`${key}Layer`];
        if (layer) layer.setVisible(newVis[key]);
      }
      return newVis;
    });
  };

  // Expand or collapse a layer group in the panel by its id
  const toggleLayerGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Render a single layer row (checkbox + info + opacity slider) for the panel.
  // Shared by every group so raster and vector layers render identically.
  const renderLayerItem = (layerConfig) => {
    const info = LAYER_INFO_CONFIG[layerConfig.key] || {};
    const opacityPct = Math.round(layerOpacity[layerConfig.key] * 100);
    return (
      <div className="layer-item" key={layerConfig.key}>
        <label className="layer-checkbox">
          <input
            type="checkbox"
            checked={layerVisibility[layerConfig.key]}
            onChange={() => toggleLayerVisibility(layerConfig.key)}
          />
          <span className="checkmark"></span>
          <span className="layer-name">{layerConfig.uiName}</span>
          <InfoIcon
            title={info.title || layerConfig.uiName}
            description={info.description}
            ariaLabel={`About ${layerConfig.uiName} layer`}
          />
        </label>
        <div className="layer-opacity-row">
          <input
            type="range"
            className="layer-opacity-slider"
            min="0"
            max="100"
            step="1"
            value={opacityPct}
            onChange={(e) => handleOpacityChange(layerConfig.key, Number(e.target.value))}
            aria-label={`Opacity for ${layerConfig.uiName}`}
          />
          <span className="layer-opacity-value">{opacityPct}%</span>
        </div>
      </div>
    );
  };

  // Set per-layer opacity from the layers panel slider (value: 0–100)
  const handleOpacityChange = (key, value) => {
    const next = Math.max(0, Math.min(100, value)) / 100;
    setLayerOpacity(prev => ({ ...prev, [key]: next }));
    if (mapInstance.current) {
      const layer = mapInstance.current[`${key}Layer`];
      if (layer) layer.setOpacity(next);
    }
  };

  // Update tile URL for all layers when time changes (no layer recreation needed)
  const updateLayersWithNewTime = (newTime) => {
    if (!mapInstance.current) return;
    const monthKey = newTime.substring(0, 7);

    WMS_LAYER_REGISTRY.forEach(({ key, tileKey, static: isStatic }) => {
      if (isStatic) return; // Static layers (e.g. DEM) do not change with time (AC5)
      const layer = mapInstance.current[`${key}Layer`];
      if (!layer) return;
      layer.getSource().setUrl(buildTileUrl(tileKey, monthKey));
    });
  };

  // Global time update function for all layers
  const handleTimeChange = (newTime) => {
    setGlobalTime(newTime);
    updateLayersWithNewTime(newTime);
  };

  // Handle date range change from the date range picker
  const handleRangeChange = (range) => {
    if (onDateRangeChange) {
      onDateRangeChange(range);
    }
  };


  // Handle station search selection
  const handleStationSearchSelect = (station) => {
    if (!mapInstance.current) return;

    const lat = asNumber(station.lat);
    const lon = asNumber(station.lon);

    if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
      const coordinate = wgsToView(lon, lat);
      const view = mapInstance.current.getView();

      // Fly to the station with bigger zoom
      view.animate({
        center: coordinate,
        zoom: 15, // Increased from 10 to 15 for better visibility
        duration: 1000
      });

      // Find and select the feature after animation
      setTimeout(() => {
        // Find the station feature in the stations layer
        if (mapInstance.current.stationsLayer && mapInstance.current.selectInteraction) {
          const stationsLayer = mapInstance.current.stationsLayer;
          const clusterSource = stationsLayer.getSource();
          const features = clusterSource.getFeatures();
          
          // Search through cluster features to find the matching station
          let foundFeature = null;
          
          for (let clusterFeature of features) {
            const clusteredFeatures = clusterFeature.get('features');
            if (clusteredFeatures) {
              for (let feature of clusteredFeatures) {
                const stationId = feature.get('stationId');
                const stationData = feature.get('station');
                // Match by both ID and Station name for better reliability
                if ((stationId === station.id) || 
                    (stationData && stationData.Station === station.Station)) {
                  foundFeature = clusterFeature;
                  break;
                }
              }
            }
            if (foundFeature) break;
          }
          
          // Clear previous selections first
          mapInstance.current.selectInteraction.getFeatures().clear();
          
          // Select the feature to highlight it in yellow
          if (foundFeature) {
            mapInstance.current.selectInteraction.getFeatures().push(foundFeature);
            
            // Force a refresh of the selection
            foundFeature.changed();
          }
        }
        
        // Trigger station selection callback
        if (onStationSelect) {
          onStationSelect({
            ...station,
            lat,
            lon
          });
        }
      }, 1100); // Increased timeout slightly to ensure animation is complete
    }
  };


  return (
    <div className="map-wrapper">
      {/* Combined logo + station search control */}
      <MapControlStack
        stations={stationsData}
        onStationSelect={handleStationSearchSelect}
      />

      {/* Map Tools Container - Layers, Marker Tool, and Panel Toggle */}
      <div className="map-tools-container" data-hover-ignore>
        <button
          className={`map-tool-button ${isBaseMapPanelOpen ? 'active' : ''}`}
          onClick={toggleBaseMapPanel}
          data-tooltip="baseMap"
          aria-label="Base map"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 20L3 17V4L9 7M9 20L15 17M9 20V7M15 17L21 20V7L15 4M15 17V4M9 7L15 4"/>
          </svg>
        </button>

        <button
          className={`map-tool-button ${isLayersPanelOpen ? 'active' : ''}`}
          onClick={toggleLayersPanel}
          data-tooltip="layers"
          aria-label="Layers"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12,2 2,7 12,12 22,7 12,2"></polygon>
            <polyline points="2,17 12,22 22,17"></polyline>
            <polyline points="2,12 12,17 22,12"></polyline>
          </svg>
        </button>

        <button
          className={`map-tool-button ${isUpstreamMode ? 'active' : ''}`}
          onClick={toggleUpstreamMode}
          data-tooltip={isUpstreamMode ? 'upstreamHide' : 'upstreamShow'}
          aria-label={isUpstreamMode ? 'Hide upstream subbasins' : 'Show upstream subbasins'}
          aria-pressed={isUpstreamMode}
        >
          {/* Branching tributary icon: trunk + two forks each splitting again */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22V12" />
            <path d="M12 12L6 6" />
            <path d="M12 12L18 6" />
            <path d="M6 6L4 3" />
            <path d="M6 6L9 3" />
            <path d="M18 6L21 3" />
            <path d="M18 6L15 3" />
          </svg>
        </button>

        <button
          className={`map-tool-button ${isLegendVisible ? 'active' : ''}`}
          onClick={toggleLegend}
          data-tooltip={isLegendVisible ? 'legendHide' : 'legendShow'}
          aria-label={isLegendVisible ? 'Hide legend' : 'Show legend'}
        >
          <img src="/photos/map-legend.png" alt="Legend" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
        </button>

        <button 
          className={`map-tool-button ${isMarkerMode ? 'active' : ''}`} 
          onClick={toggleMarkerMode}
          data-tooltip={isMarkerMode ? 'markerDeactivate' : 'markerPlace'}
          aria-label={isMarkerMode ? 'Deactivate marker tool' : 'Place marker on map'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </button>

        <button
          className={`map-tool-button graph-panel-toggle ${!isPanelHidden ? 'active' : ''}`}
          onClick={onTogglePanel}
          data-tooltip={isPanelHidden ? 'chartsPanelShow' : 'chartsPanelHide'}
          aria-label={isPanelHidden ? 'Show charts panel' : 'Hide charts panel'}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="3 17 9 11 13 15 21 7" />
            <circle cx="3" cy="17" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="9" cy="11" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="13" cy="15" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="21" cy="7" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <button
          className={`map-tool-button charts-expand-toggle ${isChartsExpanded ? 'active' : ''}`}
          onClick={onToggleChartsExpanded}
          disabled={isPanelHidden || !isChartPanelOpen}
          data-tooltip={isChartsExpanded ? 'chartsRestore' : 'chartsExpand'}
          aria-label={isChartsExpanded ? 'Restore chart panel size' : 'Expand charts panel'}
        >
          {isChartsExpanded ? (
            // Inward diagonal arrows — collapse
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20"/>
              <polyline points="20 10 14 10 14 4"/>
              <line x1="14" y1="10" x2="21" y2="3"/>
              <line x1="10" y1="14" x2="3" y2="21"/>
            </svg>
          ) : (
            // Outward diagonal arrows — expand
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          )}
        </button>
      </div>

      {/* Top-right stack: layers panel + legend share a 700px scrollable column */}
      {(isLayersPanelOpen || isLegendVisible || isBaseMapPanelOpen) && (
        <div className="map-top-right-stack" data-hover-ignore>
          {isBaseMapPanelOpen && (
            <div className="layers-panel basemap-panel">
              <div className="layers-panel-header">
                <h3>Base Map</h3>
                <button className="layers-close" onClick={toggleBaseMapPanel} data-tooltip="closePanel" aria-label="Close">
                  ✕
                </button>
              </div>
              <div className="layers-panel-content basemap-options">
                <button
                  className={`basemap-option ${activeLayer === 'osm' ? 'active' : ''}`}
                  onClick={() => switchLayer('osm')}
                >
                  <img src="/photos/OSM.png" alt="Street" className="basemap-thumb" />
                  <span className="basemap-label">Street</span>
                </button>
                <button
                  className={`basemap-option ${activeLayer === 'google' ? 'active' : ''}`}
                  onClick={() => switchLayer('google')}
                >
                  <img src="/photos/satelite.png" alt="Satellite" className="basemap-thumb" />
                  <span className="basemap-label">Satellite</span>
                </button>
              </div>
            </div>
          )}
          {isLayersPanelOpen && (
            <div className="layers-panel">
              <div className="layers-panel-header">
                <h3>Layers</h3>
                <button className="layers-close" onClick={toggleLayersPanel} data-tooltip="closePanel" aria-label="Close">
                  ✕
                </button>
              </div>
              <div className="layers-panel-content">
                {LAYER_GROUPS.map((group) => {
                  const items = ALL_LAYERS.filter(l => l.group === group.id);
                  if (items.length === 0) return null;
                  const expanded = expandedGroups[group.id];
                  const activeCount = items.filter(l => layerVisibility[l.key]).length;
                  return (
                    <div
                      className={`layer-group${expanded ? '' : ' layer-group--collapsed'}`}
                      key={group.id}
                    >
                      <button
                        type="button"
                        className="layer-group-header"
                        aria-expanded={expanded}
                        aria-controls={`layer-group-body-${group.id}`}
                        onClick={() => toggleLayerGroup(group.id)}
                      >
                        <ChevronIcon className="layer-group-chevron" />
                        <span className="layer-group-title">{group.label}</span>
                        {activeCount > 0 && (
                          <span className="layer-group-count" aria-label={`${activeCount} active`}>
                            {activeCount}
                          </span>
                        )}
                      </button>
                      <div
                        className="layer-group-body"
                        id={`layer-group-body-${group.id}`}
                        role="region"
                        aria-label={group.label}
                      >
                        <div className="layer-group-body-inner">
                          {items.map(renderLayerItem)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {isLegendVisible && (
            <Legend
              layerVisibility={{
                ...Object.fromEntries(
                  WMS_LAYER_REGISTRY.map(l => [l.stateKey, layerVisibility[l.key]])
                ),
                ...Object.fromEntries(
                  VECTOR_LAYER_REGISTRY.map(l => [l.stateKey, layerVisibility[l.key]])
                ),
              }}
            />
          )}
        </div>
      )}

      <div ref={mapRef} className={`map-container ${isMarkerMode ? 'marker-mode-active' : ''}`} />
      
      {/* Custom Zoom Controls */}
      <div className="custom-zoom-controls" data-hover-ignore>
        <button 
          className="zoom-button zoom-home"
          onClick={handleZoomHome}
          data-tooltip="zoomExtent"
          aria-label="Zoom to full extent"
        >
          <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2zm11.84 12.11h-.07A19.62 19.62 0 0 1 24 15.79a19.27 19.27 0 0 0-2.88-10.63 12 12 0 0 1 6.72 8.95zM10 16c0-5.82 2.2-10.83 5-11.81V17a26 26 0 0 1-5-.64V16zm5 3v8.84c-2.4-.85-4.37-4.65-4.87-9.41A28.57 28.57 0 0 0 15 19zm2 8.84V19a28.57 28.57 0 0 0 4.87-.57c-.5 4.73-2.47 8.57-4.87 9.38zM17 17V4.19c2.8 1 5 6 5 11.81v.33a26 26 0 0 1-5 .67zM10.88 5.16A19.27 19.27 0 0 0 8 15.79a19.62 19.62 0 0 1-3.78-1.65h-.07a12 12 0 0 1 6.73-8.98zM4 16.28a22.26 22.26 0 0 0 4.07 1.61 18.36 18.36 0 0 0 2.8 9A12 12 0 0 1 4 16.28zm17.12 10.56a18.36 18.36 0 0 0 2.8-8.95A22.26 22.26 0 0 0 28 16.28a12 12 0 0 1-6.88 10.56z"/>
          </svg>
        </button>
        <button 
          className="zoom-button zoom-in"
          onClick={handleZoomIn}
          data-tooltip="zoomIn"
          aria-label="Zoom in"
        >
          +
        </button>
        <button 
          className="zoom-button zoom-out"
          onClick={handleZoomOut}
          data-tooltip="zoomOut"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>
      
      {/* Date range picker + play controls. Shifts to bottom-left, stacked
          above the HUD, whenever the chart panel is open (the map shrinks to
          60% width and the centered picker would collide with the HUD). */}
      <DateRangePicker
        onTimeChange={handleTimeChange}
        onRangeChange={handleRangeChange}
        initialTime={globalTime}
        className={isChartPanelOpen ? 'bottom-left-stacked' : 'bottom-center'}
      />
      
      {/* Hover Tool for subbasin area display */}
      {mapInstance.current && stableSubbasins && (
        <HoverTool
          mapInstance={mapInstance.current}
          subbasinsData={stableSubbasins}
          globalTime={globalTime}
        />
      )}

      {/* Unified Bottom Info Bar */}
      <div className="map-bottom-bar" data-hover-ignore>
        {/* Coordinates */}
        <div className="bottom-bar-section coordinates-section">
          <span className="bottom-bar-value">
            {mouseCoordinates[1].toFixed(3)}°N, {mouseCoordinates[0].toFixed(3)}°E
          </span>
        </div>

        {/* Scale Bar */}
        <div className="bottom-bar-section scale-section">
          <div className="bottom-scale-bar">
            <div className="bottom-scale-line" style={{ width: `${scaleBarWidth}px` }}>
              <div className="bottom-scale-tick bottom-scale-tick-left"></div>
              <div className="bottom-scale-tick bottom-scale-tick-right"></div>
            </div>
            <div className="bottom-scale-label">{scaleBarDistance}</div>
          </div>
        </div>
      </div>

      {/* Attribution Overlay */}
      <div className="map-attribution">
        {activeLayer === 'osm'
          ? '\u00a9 OpenStreetMap contributors'
          : '\u00a9 Google'}
      </div>

      {/* Processing status indicator - above scale bar */}
      {showProcessingStatus && (
        <div className={`map-processing-status ${isProcessingClosing ? 'closing' : ''}`} data-hover-ignore>
          <button className="map-processing-close-btn" onClick={onCancelLoading} data-tooltip="cancelProcessing" aria-label="Cancel processing">
            ✕
          </button>
          <div className="map-processing-content">
            <div className="map-processing-icon">
              <div className="map-processing-spinner"></div>
            </div>
            <div className="map-processing-text">
              <span className="map-processing-label">Processing graph data</span>
            </div>
            <div className="map-processing-time">
              <div className="map-time-remaining-container">
                <span className="map-time-value remaining">{formatTime(remainingSeconds)}</span>
              </div>
            </div>
          </div>
          <div className="map-processing-progress">
            <div 
              className="map-processing-progress-bar" 
              style={{ 
                width: initialSeconds > 0 
                  ? `${((initialSeconds - remainingSeconds) / initialSeconds) * 100}%` 
                  : '100%' 
              }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
