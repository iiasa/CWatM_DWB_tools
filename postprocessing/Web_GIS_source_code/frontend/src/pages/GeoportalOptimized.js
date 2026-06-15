import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Point } from 'ol/geom';
import { Feature } from 'ol';
import { Style, Circle, Fill, Stroke } from 'ol/style';
import { Select } from 'ol/interaction';
import { click } from 'ol/events/condition';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import 'ol/ol.css';
import config from '../config/app.config';
import apiService from '../services/api.service';
import { useMapOptimization } from '../hooks/useMapOptimization';
import { useWebWorker } from '../hooks/useWebWorker';
import { useAsyncData } from '../hooks/useAsyncData';
import './Geoportal.css';

const CRS_VIEW = 'EPSG:3857';

const GeoportalOptimized = () => {
  const mapRef = useRef();
  const mapInstance = useRef();
  const popupRef = useRef();
  
  // State
  const [activeLayer, setActiveLayer] = useState('google');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [selectedStationInfo, setSelectedStationInfo] = useState(null);
  const [selectedSubbasinId, setSelectedSubbasinId] = useState(null);
  const [selectedSubbasinInfo, setSelectedSubbasinInfo] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState({ stations: 0, subbasins: 0 });

  // Hooks
  const {
    debouncedViewChange,
    createStationStyle,
    createSelectedStationStyle,
    createSubbasinStyle,
    createSelectedSubbasinStyle,
    coordinateUtils,
    cleanup
  } = useMapOptimization();

  const worker = useWebWorker('/workers/dataProcessor.worker.js');

  // Async data loading
  const {
    data: stationsData,
    loading: stationsLoading,
    error: stationsError,
    fetch: fetchStations
  } = useAsyncData(apiService.getCalibStations, {
    immediate: false,
    onSuccess: (data) => {
      setLoadingProgress(prev => ({ ...prev, stations: 100 }));
    }
  });

  const {
    data: subbasinsData,
    loading: subbasinsLoading,
    error: subbasinsError,
    fetch: fetchSubbasins
  } = useAsyncData(apiService.getSubbasins, {
    immediate: false,
    onSuccess: (data) => {
      setLoadingProgress(prev => ({ ...prev, subbasins: 100 }));
    }
  });

  // Memoized layer creation functions
  const createStationsLayer = useCallback((processedStations) => {
    const vectorSource = new VectorSource();

    processedStations.forEach((station) => {
      const feature = new Feature({
        geometry: new Point(coordinateUtils.wgsToView(station.lon, station.lat)),
        station: station,
        stationId: station.id
      });
      feature.setStyle(createStationStyle());
      vectorSource.addFeature(feature);
    });

    return new VectorLayer({
      source: vectorSource,
      style: createStationStyle()
    });
  }, [coordinateUtils, createStationStyle]);

  const createSubbasinsLayer = useCallback((processedSubbasins) => {
    const vectorSource = new VectorSource();
    const geoJSONFormat = new GeoJSON();

    try {
      if (processedSubbasins.type === 'FeatureCollection' && processedSubbasins.features) {
        const features = geoJSONFormat.readFeatures(processedSubbasins, {
          dataProjection: 'EPSG:4326',
          featureProjection: CRS_VIEW
        });

        features.forEach((feature) => {
          const properties = feature.getProperties();
          feature.set('subbasin', properties);
          feature.set('subbasinId', properties.id);
          feature.setStyle(createSubbasinStyle());
          vectorSource.addFeature(feature);
        });
      }
    } catch (error) {
      console.error('Error creating subbasins layer:', error);
    }

    return new VectorLayer({
      source: vectorSource,
      style: createSubbasinStyle(),
      zIndex: 1
    });
  }, [createSubbasinStyle]);

  // Memoized base layers
  const baseLayers = useMemo(() => {
    const googleLayer = new TileLayer({
      source: new XYZ({
        url: config.map.googleSatelliteUrl,
        attributions: '© Google',
        crossOrigin: 'anonymous',
        tilePixelRatio: 1,
        transition: 0
      }),
      visible: true
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
      visible: false
    });
    osmLayer.set('id', 'base-osm');
    osmLayer.set('name', 'OpenStreetMap');

    return { googleLayer, osmLayer };
  }, []);

  // Process data with Web Worker
  const processDataWithWorker = useCallback((type, data) => {
    return new Promise((resolve, reject) => {
      const handler = (processedData) => {
        worker.removeMessageHandler(`${type}_PROCESSED`);
        resolve(processedData);
      };

      worker.onMessage(`${type}_PROCESSED`, handler);
      worker.postMessage(type, data);

      // Fallback timeout
      setTimeout(() => {
        worker.removeMessageHandler(`${type}_PROCESSED`);
        reject(new Error('Worker timeout'));
      }, 10000);
    });
  }, [worker]);

  // Load stations with worker processing
  const loadStations = useCallback(async () => {
    try {
      setLoadingProgress(prev => ({ ...prev, stations: 10 }));
      
      const rawStations = await fetchStations();
      setLoadingProgress(prev => ({ ...prev, stations: 50 }));

      if (worker.isWorkerAvailable) {
        const processedStations = await processDataWithWorker('PROCESS_STATIONS', rawStations);
        setLoadingProgress(prev => ({ ...prev, stations: 80 }));
        
        if (processedStations.length > 0) {
          const stationsLayer = createStationsLayer(processedStations);
          stationsLayer.set('id', 'stations-layer');
          stationsLayer.set('name', 'Calibration Stations');
          stationsLayer.setZIndex(10);
          mapInstance.current.addLayer(stationsLayer);
          mapInstance.current.stationsLayer = stationsLayer;
        }
      } else {
        // Fallback to main thread
        const validStations = rawStations.filter(station => {
          const lat = coordinateUtils.asNumber(station.lat);
          const lon = coordinateUtils.asNumber(station.lon);
          return lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon);
        });
        
        if (validStations.length > 0) {
          const stationsLayer = createStationsLayer(validStations);
          stationsLayer.set('id', 'stations-layer');
          stationsLayer.set('name', 'Calibration Stations');
          stationsLayer.setZIndex(10);
          mapInstance.current.addLayer(stationsLayer);
          mapInstance.current.stationsLayer = stationsLayer;
        }
      }
    } catch (error) {
      console.error('Error loading stations:', error);
    }
  }, [fetchStations, processDataWithWorker, createStationsLayer, coordinateUtils, worker.isWorkerAvailable]);

  // Load subbasins with worker processing
  const loadSubbasins = useCallback(async () => {
    try {
      setLoadingProgress(prev => ({ ...prev, subbasins: 10 }));
      
      const rawSubbasins = await fetchSubbasins();
      setLoadingProgress(prev => ({ ...prev, subbasins: 50 }));

      const hasData = (rawSubbasins.type === 'FeatureCollection' && rawSubbasins.features && rawSubbasins.features.length > 0) ||
                      (Array.isArray(rawSubbasins) && rawSubbasins.length > 0);
      
      if (hasData) {
        if (worker.isWorkerAvailable) {
          const processedSubbasins = await processDataWithWorker('PROCESS_SUBBASINS', rawSubbasins);
          setLoadingProgress(prev => ({ ...prev, subbasins: 80 }));
          
          const subbasinsLayer = createSubbasinsLayer(processedSubbasins);
          subbasinsLayer.set('id', 'subbasins-layer');
          subbasinsLayer.set('name', 'Subbasins');
          subbasinsLayer.setZIndex(1);
          subbasinsLayer.setVisible(true);
          mapInstance.current.addLayer(subbasinsLayer);
          mapInstance.current.subbasinsLayer = subbasinsLayer;
        } else {
          // Fallback to main thread
          const subbasinsLayer = createSubbasinsLayer(rawSubbasins);
          subbasinsLayer.set('id', 'subbasins-layer');
          subbasinsLayer.set('name', 'Subbasins');
          subbasinsLayer.setZIndex(1);
          subbasinsLayer.setVisible(true);
          mapInstance.current.addLayer(subbasinsLayer);
          mapInstance.current.subbasinsLayer = subbasinsLayer;
        }
      }
    } catch (error) {
      console.error('Error loading subbasins:', error);
    }
  }, [fetchSubbasins, processDataWithWorker, createSubbasinsLayer, worker.isWorkerAvailable]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    const { googleLayer, osmLayer } = baseLayers;

    const map = new Map({
      target: mapRef.current,
      layers: [googleLayer, osmLayer],
      view: new View({
        projection: CRS_VIEW,
        center: coordinateUtils.wgsToView(config.map.defaultCenter.lon, config.map.defaultCenter.lat),
        zoom: config.map.defaultZoom,
        minZoom: config.map.minZoom,
        maxZoom: config.map.maxZoom
      })
    });

    mapInstance.current = map;
    mapInstance.current.googleLayer = googleLayer;
    mapInstance.current.osmLayer = osmLayer;

    // Popup overlay
    const popupOverlay = new Overlay({
      element: popupRef.current,
      positioning: 'center-left',
      offset: [40, 0],
      stopEvent: false,
      autoPan: { animation: { duration: 250 } }
    });
    map.addOverlay(popupOverlay);
    mapInstance.current.popupOverlay = popupOverlay;

    // Select interaction
    const selectInteraction = new Select({
      condition: click,
      style: (feature) => {
        if (feature.get('stationId')) {
          return createSelectedStationStyle();
        } else if (feature.get('subbasinId')) {
          return createSelectedSubbasinStyle();
        }
        return null;
      }
    });

    selectInteraction.on('select', (event) => {
      const selectedFeatures = event.selected;
      if (selectedFeatures.length > 0) {
        const feature = selectedFeatures[0];
        const stationId = feature.get('stationId');
        const subbasinId = feature.get('subbasinId');

        if (stationId) {
          const stationData = feature.get('station');
          const coordView = feature.getGeometry().getCoordinates();
          const { lon, lat } = coordinateUtils.viewToWgs(coordView);

          setSelectedStationId(stationId);
          setSelectedStationInfo({ ...stationData, lat, lon });
          setSelectedSubbasinId(null);
          setSelectedSubbasinInfo(null);

          popupOverlay.setPosition(coordView);
        } else if (subbasinId) {
          const subbasinData = feature.get('subbasin');
          const extent = feature.getGeometry().getExtent();
          const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];

          setSelectedSubbasinId(subbasinId);
          setSelectedSubbasinInfo(subbasinData);
          setSelectedStationId(null);
          setSelectedStationInfo(null);

          popupOverlay.setPosition(center);
        }
      } else {
        setSelectedStationId(null);
        setSelectedStationInfo(null);
        setSelectedSubbasinId(null);
        setSelectedSubbasinInfo(null);
        popupOverlay.setPosition(undefined);
      }
    });

    map.on('pointermove', (event) => {
      const features = map.getFeaturesAtPixel(event.pixel) || [];
      map.getViewport().style.cursor = features.length > 0 ? 'pointer' : 'default';
    });

    map.addInteraction(selectInteraction);
    mapInstance.current.selectInteraction = selectInteraction;

    // Load data asynchronously
    loadStations();
    loadSubbasins();

    return () => {
      cleanup();
      if (mapInstance.current) {
        mapInstance.current.setTarget(null);
      }
    };
  }, [baseLayers, coordinateUtils, createSelectedStationStyle, createSelectedSubbasinStyle, loadStations, loadSubbasins, cleanup]);

  // Layer switching
  const switchLayer = useCallback((layerType) => {
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
    setIsDropdownOpen(false);
  }, []);

  const toggleDropdown = useCallback(() => setIsDropdownOpen(!isDropdownOpen), [isDropdownOpen]);

  const getActiveLayerName = useCallback(() => {
    switch (activeLayer) {
      case 'google':
        return 'Google Satellite';
      case 'osm':
        return 'OpenStreetMap';
      default:
        return 'Google Satellite';
    }
  }, [activeLayer]);

  const closePopup = useCallback(() => {
    setSelectedStationId(null);
    setSelectedStationInfo(null);
    setSelectedSubbasinId(null);
    setSelectedSubbasinInfo(null);
    
    if (mapInstance.current?.selectInteraction) {
      mapInstance.current.selectInteraction.getFeatures().clear();
    }
    
    if (mapInstance.current?.popupOverlay) {
      mapInstance.current.popupOverlay.setPosition(undefined);
    }
  }, []);

  return (
    <div className="geoportal-container">
      {/* Loading progress indicator */}
      {(stationsLoading || subbasinsLoading) && (
        <div className="loading-indicator">
          <div className="loading-progress">
            <div className="progress-item">
              <span>Stations: {loadingProgress.stations}%</span>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${loadingProgress.stations}%` }}
                />
              </div>
            </div>
            <div className="progress-item">
              <span>Subbasins: {loadingProgress.subbasins}%</span>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${loadingProgress.subbasins}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error indicators */}
      {stationsError && (
        <div className="error-indicator">
          <span>Error loading stations: {stationsError.message}</span>
        </div>
      )}
      {subbasinsError && (
        <div className="error-indicator">
          <span>Error loading subbasins: {subbasinsError.message}</span>
        </div>
      )}

      {/* Popup */}
      <div ref={popupRef} className="station-popup">
        {selectedStationId && selectedStationInfo && (
          <div className="popup-content">
            <div className="popup-header">
              <span className="popup-title">
                Station: {selectedStationInfo.Station || 'N/A'}
              </span>
              <button className="popup-close" onClick={closePopup} title="Close">
                ✕
              </button>
            </div>
            <div className="popup-details">
              <div className="popup-field">
                <span className="popup-label">Coordinates:</span>
                <span className="popup-value">
                  {selectedStationInfo.lat?.toFixed(3) ?? 'N/A'},{' '}
                  {selectedStationInfo.lon?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
              <div className="popup-field">
                <span className="popup-label">Country:</span>
                <span className="popup-value">{selectedStationInfo.Country || 'N/A'}</span>
              </div>
              <div className="popup-field">
                <span className="popup-label">Subbasin:</span>
                <span className="popup-value">{selectedStationInfo.Subbasin || 'N/A'}</span>
              </div>
              <div className="popup-field">
                <span className="popup-label">River:</span>
                <span className="popup-value">{selectedStationInfo.River || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}
        {selectedSubbasinId && selectedSubbasinInfo && (
          <div className="popup-content">
            <div className="popup-header">
              <span className="popup-title">
                Subbasin: {selectedSubbasinInfo.HYBAS_ID || 'N/A'}
              </span>
              <button className="popup-close" onClick={closePopup} title="Close">
                ✕
              </button>
            </div>
            <div className="popup-details">
              <div className="popup-field">
                <span className="popup-label">HYBAS ID:</span>
                <span className="popup-value">{selectedSubbasinInfo.HYBAS_ID || 'N/A'}</span>
              </div>
              <div className="popup-field">
                <span className="popup-label">Main Basin:</span>
                <span className="popup-value">{selectedSubbasinInfo.MAIN_BAS || 'N/A'}</span>
              </div>
              <div className="popup-field">
                <span className="popup-label">Sub Area:</span>
                <span className="popup-value">
                  {selectedSubbasinInfo.SUB_AREA ? `${selectedSubbasinInfo.SUB_AREA.toFixed(2)} km²` : 'N/A'}
                </span>
              </div>
              <div className="popup-field">
                <span className="popup-label">Upstream Area:</span>
                <span className="popup-value">
                  {selectedSubbasinInfo.UP_AREA ? `${selectedSubbasinInfo.UP_AREA.toFixed(2)} km²` : 'N/A'}
                </span>
              </div>
              <div className="popup-field">
                <span className="popup-label">Stream Order:</span>
                <span className="popup-value">{selectedSubbasinInfo.ORDER || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Layer switcher */}
      <div className="layer-switcher">
        <div className="dropdown-container">
          <button className="dropdown-toggle" onClick={toggleDropdown}>
            <span>{getActiveLayerName()}</span>
            <span className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
          </button>
          {isDropdownOpen && (
            <div className="dropdown-menu">
              <button
                className={`dropdown-item ${activeLayer === 'google' ? 'active' : ''}`}
                onClick={() => switchLayer('google')}
              >
                Google Satellite
              </button>
              <button
                className={`dropdown-item ${activeLayer === 'osm' ? 'active' : ''}`}
                onClick={() => switchLayer('osm')}
              >
                OpenStreetMap
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map container */}
      <div ref={mapRef} className="map-container" />
    </div>
  );
};

export default GeoportalOptimized;
