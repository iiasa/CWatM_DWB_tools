import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { toLonLat } from 'ol/proj';
import config from '../config/app.config';
import { LAYER_DISPLAY_CONFIG, LULC_CLASS_MAP } from '../config/layerLegendConfig';
import './HoverTool.css';

const TOOLTIP_GAP = 15;
const EDGE_PADDING = 4;
const LAYER_FETCH_DEBOUNCE_MS = 300;
const SHOW_DELAY_MS = 100;

/**
 * HoverTool - Displays contextual information about map features on hover.
 * Positions tooltip above the cursor with smart edge detection.
 * Hides when hovering over UI controls marked with data-hover-ignore.
 *
 * @param {Object} props.mapInstance - OpenLayers map instance
 * @param {Object} props.subbasinsData - Subbasins GeoJSON data
 * @param {string} props.globalTime - Current time in YYYY-MM-DD format
 */
const HoverTool = ({ mapInstance, subbasinsData, globalTime }) => {
  const [mousePosition, setMousePosition] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [layerValues, setLayerValues] = useState({});
  const [mapBounds, setMapBounds] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState(null);

  const tooltipRef = useRef(null);
  const layerValuesRef = useRef({});
  const debounceTimerRef = useRef(null);
  const showTimerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // Keep ref in sync with state so the pointermove handler reads fresh values
  useEffect(() => {
    layerValuesRef.current = layerValues;
  }, [layerValues]);

  // Fetch pixel values from backend API (reads NetCDF files directly)
  const fetchLayerValues = useCallback(async (coordinate, map) => {
    const [lon, lat] = toLonLat(coordinate);
    const backendUrl = config.backend?.url || 'http://localhost:8085';

    const monthKey = globalTime ? globalTime.substring(0, 7) : null;

    // `static: true` layers (e.g. DEM) are time-independent: no time parameter,
    // and 0 is a valid value (sea level), so it must not be filtered out.
    const layerConfigs = [
      { id: 'lulcLayer', name: 'LULC', variable: 'lulc', static: true },
      { id: 'demLayer', name: 'DEM', variable: 'dem', static: true },
      { id: 'dischargeLayer', name: 'Discharge', variable: 'discharge' },
      { id: 'etrefLayer', name: 'ETRef', variable: 'etref' },
      { id: 'iceMeltLayer', name: 'IceMelt', variable: 'icemelt' },
      { id: 'rainLayer', name: 'Rain', variable: 'rain' },
      { id: 'runoffLayer', name: 'Runoff', variable: 'runoff' },
      { id: 'snowLayer', name: 'Snow', variable: 'snow' },
      { id: 'snowFractionLayer', name: 'SnowFraction', variable: 'snowfraction' },
      { id: 'snowMeltLayer', name: 'SnowMelt', variable: 'snowmelt' },
      { id: 'totalETWBLayer', name: 'TotalET_WB', variable: 'totalet' },
      { id: 'twsLayer', name: 'TWS', variable: 'tws' },
    ];

    const values = {};
    const promises = [];

    for (const layerCfg of layerConfigs) {
      const layer = map[layerCfg.id];
      if (!layer || !layer.getVisible()) continue;
      // Time-series layers need a month; skip them if the time is unknown.
      if (!layerCfg.static && !monthKey) continue;

      const timeParam = layerCfg.static ? '' : `&time=${monthKey}`;
      const url = `${backendUrl}/tiles/value?variable=${layerCfg.variable}${timeParam}&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`;
      promises.push(
        fetch(url)
          .then(res => res.json())
          .then(data => {
            const isInvalid =
              data.value === null || data.value === undefined ||
              isNaN(data.value) || data.value === -9999 ||
              (!layerCfg.static && data.value === 0);
            if (!isInvalid) {
              values[layerCfg.name] = data.value;
            }
          })
          .catch(() => {})
      );
    }

    await Promise.all(promises);
    return values;
  }, [globalTime]);

  // Calculate tooltip position based on cursor, tooltip size, and map bounds
  const calculateTooltipPosition = useCallback(() => {
    if (!mousePosition || !tooltipRef.current || !mapBounds) return null;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;

    const cursorX = mousePosition.x;
    const cursorY = mousePosition.y;

    // Default: center horizontally, place above cursor
    let left = cursorX - tooltipWidth / 2;
    let top = cursorY - tooltipHeight - TOOLTIP_GAP;

    // Near top edge: flip to below cursor
    if (top < mapBounds.top) {
      top = cursorY + TOOLTIP_GAP;
    }

    // Near left edge: shift right
    if (left < mapBounds.left + EDGE_PADDING) {
      left = mapBounds.left + EDGE_PADDING;
    }

    // Near right edge: shift left (respects map boundary, not viewport)
    if (left + tooltipWidth > mapBounds.right - EDGE_PADDING) {
      left = mapBounds.right - tooltipWidth - EDGE_PADDING;
    }

    // Near bottom edge (when flipped below): clamp
    if (top + tooltipHeight > mapBounds.bottom - EDGE_PADDING) {
      top = mapBounds.bottom - tooltipHeight - EDGE_PADDING;
    }

    return { left, top };
  }, [mousePosition, mapBounds]);

  // Clear all tooltip state and pending timers
  const hideTooltip = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setIsActive(false);
    setIsVisible(false);
    setMousePosition(null);
    setHoverData(null);
    setLayerValues({});
  }, []);

  // Register pointermove and mouseleave handlers on the map
  useEffect(() => {
    if (!mapInstance || !subbasinsData) return;

    const map = mapInstance;
    const mapElement = map.getTargetElement();
    let hoveredFeature = null;

    // Hide tooltip when cursor leaves the map element entirely
    const handleMouseLeave = () => {
      hideTooltip();
      map.getViewport().style.cursor = 'default';
    };

    const handlePointerMove = (event) => {
      const pixel = event.pixel;
      const mapRect = mapElement.getBoundingClientRect();

      const cursorX = mapRect.left + pixel[0];
      const cursorY = mapRect.top + pixel[1];

      // Check if cursor is over a UI control
      const elementUnderCursor = document.elementFromPoint(cursorX, cursorY);
      if (elementUnderCursor && elementUnderCursor.closest('[data-hover-ignore]')) {
        hideTooltip();
        return;
      }

      setMousePosition({ x: cursorX, y: cursorY });
      setMapBounds(mapRect);

      // Debounce layer value fetching
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        const coordinate = map.getCoordinateFromPixel(pixel);
        const values = await fetchLayerValues(coordinate, map);
        setLayerValues(values);
      }, LAYER_FETCH_DEBOUNCE_MS);

      // Schedule tooltip appearance after a short delay to avoid flickering
      const scheduleShow = () => {
        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current);
        }
        setIsActive(true);
        showTimerRef.current = setTimeout(() => {
          setIsVisible(true);
        }, SHOW_DELAY_MS);
      };

      // Detect features under cursor
      let subbasinFeature = null;
      let stationFeature = null;

      map.forEachFeatureAtPixel(event.pixel, (feature, layer) => {
        if (layer.get('id') && layer.get('id').includes('subbasin')) {
          subbasinFeature = feature;
        }

        const clusteredFeatures = feature.get('features');
        if (clusteredFeatures) {
          if (clusteredFeatures.length === 1) {
            const singleFeature = clusteredFeatures[0];
            const stationData = singleFeature.get('station');
            if (stationData && stationData.Station) {
              stationFeature = singleFeature;
            }
          }
        } else {
          const stationData = feature.get('station');
          if (stationData && stationData.Station) {
            stationFeature = feature;
          }
        }
      });

      const feature = stationFeature || subbasinFeature;
      const currentLayerValues = layerValuesRef.current;

      const parseMetric = (value) => {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : parseFloat(value);
        return Number.isFinite(num) ? num : null;
      };

      if (feature || Object.keys(currentLayerValues).length > 0) {
        // Only show pointer cursor for actual clickable features
        map.getViewport().style.cursor = feature ? 'pointer' : 'default';

        if (hoveredFeature !== feature) {
          hoveredFeature = feature;

          if (stationFeature) {
            const stationData = stationFeature.get('station');
            const lat = stationData?.lat ? parseFloat(stationData.lat) : null;
            const lon = stationData?.lon ? parseFloat(stationData.lon) : null;

            setHoverData({
              stationName: stationData?.Station ?? 'N/A',
              coordinates: (lat !== null && lon !== null) ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : 'N/A',
              river: stationData?.River ?? 'N/A',
              subbasin: stationData?.Subbasin ?? 'N/A',
              country: stationData?.Country ?? 'N/A',
              kgeCal: parseMetric(stationData?.KGE_cal),
              kgeVal: parseMetric(stationData?.KGE_val),
              isOverSubbasin: false,
              isOverStation: true,
            });
            scheduleShow();
          } else if (subbasinFeature) {
            const properties = subbasinFeature.getProperties();

            setHoverData({
              subbasinId: properties.subbasinId || properties.id || 'N/A',
              associatedStation: properties.Station ?? 'N/A',
              subbasinName: properties.Subbasin ?? 'N/A',
              country: properties.Country ?? 'N/A',
              river: properties.River ?? 'N/A',
              area: parseMetric(properties.area),
              isOverSubbasin: true,
              isOverStation: false,
            });
            scheduleShow();
          } else if (Object.keys(currentLayerValues).length === 0) {
            hideTooltip();
          } else {
            setHoverData({ isOverSubbasin: false, isOverStation: false });
            scheduleShow();
          }
        } else if (Object.keys(currentLayerValues).length > 0 && !feature) {
          setHoverData({ isOverSubbasin: false, isOverStation: false });
          scheduleShow();
        }
      } else {
        if (hoveredFeature) {
          hoveredFeature = null;
          hideTooltip();
        }
        map.getViewport().style.cursor = 'default';
      }
    };

    mapElement.addEventListener('mouseleave', handleMouseLeave);
    map.on('pointermove', handlePointerMove);

    return () => {
      mapElement.removeEventListener('mouseleave', handleMouseLeave);
      map.un('pointermove', handlePointerMove);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
    };
  }, [mapInstance, subbasinsData, globalTime, fetchLayerValues, hideTooltip]);

  // Build tooltip content from hover data
  const tooltipContent = useMemo(() => {
    if (!hoverData || !isActive) return null;

    return (
      <div className="hover-tooltip-content">
        {hoverData.isOverStation ? (
          <div className="hover-tooltip-station">
            <div className="hover-tooltip-station-name">{hoverData.stationName}</div>
            <div className="hover-tooltip-station-details">
              <div className="hover-tooltip-station-row">
                <span className="hover-tooltip-label">Coordinates:</span>
                <span className="hover-tooltip-value">{hoverData.coordinates}</span>
              </div>
              <div className="hover-tooltip-station-row">
                <span className="hover-tooltip-label">River:</span>
                <span className="hover-tooltip-value">{hoverData.river}</span>
              </div>
              <div className="hover-tooltip-station-row">
                <span className="hover-tooltip-label">Subbasin:</span>
                <span className="hover-tooltip-value">{hoverData.subbasin}</span>
              </div>
              {hoverData.country && hoverData.country !== 'N/A' && (
                <div className="hover-tooltip-station-row">
                  <span className="hover-tooltip-label">Country:</span>
                  <span className="hover-tooltip-value">{hoverData.country}</span>
                </div>
              )}
              {(typeof hoverData.kgeCal === 'number' && Number.isFinite(hoverData.kgeCal)) && (
                <div className="hover-tooltip-station-row">
                  <span className="hover-tooltip-label">KGE (Cal):</span>
                  <span className="hover-tooltip-value">{hoverData.kgeCal.toFixed(2)}</span>
                </div>
              )}
              {(typeof hoverData.kgeVal === 'number' && Number.isFinite(hoverData.kgeVal)) && (
                <div className="hover-tooltip-station-row">
                  <span className="hover-tooltip-label">KGE (Val):</span>
                  <span className="hover-tooltip-value">{hoverData.kgeVal.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {hoverData.isOverSubbasin && (
              <div className="hover-tooltip-subbasin">
                <div className="hover-tooltip-subbasin-id">{hoverData.associatedStation || hoverData.subbasinName}</div>
                <div className="hover-tooltip-subbasin-details">
                  {hoverData.subbasinName && (
                    <div className="hover-tooltip-subbasin-row">
                      <span className="hover-tooltip-label">Subbasin:</span>
                      <span className="hover-tooltip-value">{hoverData.subbasinName}</span>
                    </div>
                  )}
                  {hoverData.country && hoverData.country !== 'N/A' && (
                    <div className="hover-tooltip-subbasin-row">
                      <span className="hover-tooltip-label">Country:</span>
                      <span className="hover-tooltip-value">{hoverData.country}</span>
                    </div>
                  )}
                  {hoverData.river && (
                    <div className="hover-tooltip-subbasin-row">
                      <span className="hover-tooltip-label">River:</span>
                      <span className="hover-tooltip-value">{hoverData.river}</span>
                    </div>
                  )}
                  {(typeof hoverData.area === 'number') && Number.isFinite(hoverData.area) && (
                    <div className="hover-tooltip-subbasin-row">
                      <span className="hover-tooltip-label">Area:</span>
                      <span className="hover-tooltip-value">{(hoverData.area / 1_000_000).toFixed(2)} km²</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {Object.keys(layerValues).length > 0 && (
          <div className="hover-tooltip-layers">
            <div className="hover-tooltip-layers-title">Layer Values:</div>
            {Object.entries(layerValues).map(([layerName, value]) => {
              // LULC is categorical: show the class name, not a numeric value (AC4).
              if (layerName === 'LULC') {
                const className = LULC_CLASS_MAP[Math.round(value)];
                if (!className) return null; // unknown / nodata code → skip the row
                return (
                  <div key={layerName} className="hover-tooltip-layer-row">
                    <span className="hover-tooltip-layer-name">{layerName}:</span>
                    <span className="hover-tooltip-layer-value">{className}</span>
                  </div>
                );
              }

              const displayCfg = LAYER_DISPLAY_CONFIG[layerName];
              const displayValue = displayCfg
                ? (value * displayCfg.factor).toFixed(displayCfg.decimals)
                : value.toFixed(3);
              const displayUnit = displayCfg ? displayCfg.unit : '';
              return (
                <div key={layerName} className="hover-tooltip-layer-row">
                  <span className="hover-tooltip-layer-name">{layerName}:</span>
                  <span className="hover-tooltip-layer-value">
                    {displayValue}{displayUnit ? ` ${displayUnit}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }, [hoverData, isActive, layerValues]);

  // Recalculate position after tooltip content renders and layout completes
  useEffect(() => {
    if (!mousePosition || !tooltipRef.current || !mapBounds) {
      setTooltipPosition(null);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      setTooltipPosition(calculateTooltipPosition());
    });

    return () => cancelAnimationFrame(frameId);
  }, [mousePosition, mapBounds, hoverData, isActive, layerValues, calculateTooltipPosition]);

  if (!tooltipContent || !isVisible) return null;

  return (
    <div
      ref={tooltipRef}
      className="hover-tooltip"
      style={{
        position: 'fixed',
        left: tooltipPosition ? `${tooltipPosition.left}px` : '-9999px',
        top: tooltipPosition ? `${tooltipPosition.top}px` : '-9999px',
        zIndex: 2000,
        pointerEvents: 'none',
        visibility: tooltipPosition ? 'visible' : 'hidden',
      }}
    >
      {tooltipContent}
    </div>
  );
};

export default HoverTool;
