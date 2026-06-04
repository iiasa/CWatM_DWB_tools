// src/pages/Geoportal.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo, useId } from 'react';
import ChartFullscreenModal from '../components/ChartFullscreenModal';
import apiService from '../services/api.service';
import useStationSelection from '../hooks/useStationSelection';
import MapComponent from '../components/Map';
import StationChart from '../components/StationChart';
import SubbasinChart from '../components/SubbasinChart';
import PointGraph from '../components/PointGraph';
import WaterBalancePieChart from '../components/WaterBalancePieChart';
import { downloadAsZip, sanitizeFilename } from '../utils/exportUtils';
import './Geoportal.css';

const Geoportal = () => {
  const mapInstance = useRef();
  const [stationsData, setStationsData] = useState([]);
  const [subbasinsData, setSubbasinsData] = useState(null);

  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [chartType, setChartType] = useState('station'); // station | subbasin | point

  const [isLoadingSubbasin, setIsLoadingSubbasin] = useState(false);
  const [isLoadingPoint, setIsLoadingPoint] = useState(false);
  const [pointProgress, setPointProgress] = useState(null);
  const abortControllerRef = useRef(null);

  const [selectedStationInfo, setSelectedStationInfo] = useState(null);
  const [selectedSubbasinInfo, setSelectedSubbasinInfo] = useState(null);

  const [globalDateRange, setGlobalDateRange] = useState({
    startDate: '1990-01-01',
    endDate: '2020-01-01'
  });

  // Coverage bbox of the backend point-data NetCDFs (Danube basin). When known,
  // we short-circuit clicks outside this bbox with a clearer message instead of
  // a generic "No data found for location" stream error.
  const [coverageBbox, setCoverageBbox] = useState(null);

  const { sendSelectedStation } = useStationSelection();

  // Panel visibility control
  const [isPanelHidden, setIsPanelHidden] = useState(true);

  const togglePanelVisibility = () => {
    setIsPanelHidden(!isPanelHidden);
  };

  // Expand/collapse charts panel (swap to 60/40 chart-dominant layout)
  const [isChartsExpanded, setIsChartsExpanded] = useState(false);
  // Fullscreen popup for the subbasin pie chart that lives directly in this
  // page layout (separate from the SubbasinChart pie, which is hidden here).
  const [isSubbasinPieFullscreen, setIsSubbasinPieFullscreen] = useState(false);
  const subbasinPieFsTitleId = useId();
  const subbasinPieExpandBtnRef = useRef(null);
  // True while the CSS width/height transition on .charts-panel is in flight.
  // Chart libraries (Plotly, Chart.js) install ResizeObservers that otherwise
  // fire every frame and recompute heavy layouts during the animation; we gate
  // their work on this flag and run a single explicit resize at transitionend.
  const [isPanelAnimating, setIsPanelAnimating] = useState(false);
  const chartsPanelRef = useRef(null);

  const toggleChartsExpanded = () => {
    setIsChartsExpanded((prev) => !prev);
  };

  // AC9: reset expanded state whenever the panel transitions to hidden,
  // so the next time it opens it starts at the default 60/40 size.
  useEffect(() => {
    if (isPanelHidden) {
      setIsChartsExpanded(false);
    }
  }, [isPanelHidden]);

  // ===== COMMENTED OUT: Real processing time calculation =====
  // const getAverageProcessingTime = () => {
  //   try {
  //     const history = JSON.parse(localStorage.getItem('pointProcessingHistory') || '[]');
  //     if (history.length === 0) return 1065;
  //     const recent = history.slice(-10);
  //     const sum = recent.reduce((a, t) => a + t, 0);
  //     const avg = Math.round(sum / recent.length);
  //     return Math.round(avg * 1.1);
  //   } catch {
  //     return 1065;
  //   }
  // };

  // const saveProcessingTime = (duration) => {
  //   try {
  //     const history = JSON.parse(localStorage.getItem('pointProcessingHistory') || '[]');
  //     history.push(duration);
  //     const trimmed = history.slice(-20);
  //     localStorage.setItem('pointProcessingHistory', JSON.stringify(trimmed));
  //   } catch {}
  // };

  // window.resetPointProcessingHistory = () => {
  //   localStorage.removeItem('pointProcessingHistory');
  // };

  // const formatTimeForLog = (seconds) => {
  //   const mins = Math.floor(seconds / 60);
  //   const secs = seconds % 60;
  //   return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  // };

  // useEffect(() => {
  //   if (isLoadingPoint && elapsedTime > estimatedTime && estimatedTime > 0) {
  //     const newEstimate = estimatedTime + 120;
  //     setEstimatedTime(newEstimate);
  //     console.log(`Extended estimate to ${formatTimeForLog(newEstimate)}`);
  //   }
  // }, [isLoadingPoint, elapsedTime, estimatedTime]);
  // ===== END COMMENTED OUT =====

  useEffect(() => {
    const loadData = async () => {
      try {
        // /subbasins/catalog returns id + label fields only (no polygon geometry).
        // Polygons are rendered by the MVT vector tile layer in Map.js, so the
        // load-time fetch only needs metadata for lookups + bbox estimation.
        const [stations, subbasins] = await Promise.all([
          apiService.getCalibStations(),
          apiService.getSubbasinsCatalog()
        ]);
        setStationsData(stations || []);
        setSubbasinsData(subbasins || null);
      } catch (error) {
        console.error('Error loading map data:', error);
      }
    };
    loadData();

    apiService.getCoverageBbox().then((bbox) => {
      if (bbox && Number.isFinite(bbox.lat_min)) {
        setCoverageBbox(bbox);
      }
    });
  }, []);

  // Friendly message for a clicked point that falls outside the coverage bbox.
  const formatOutOfBboxMessage = (lat, lon, bbox) => {
    if (!bbox) return null;
    return (
      `This location (lat ${lat.toFixed(4)}, lon ${lon.toFixed(4)}) is outside the Danube basin coverage.\n` +
      `Coverage: lat ${bbox.lat_min}° to ${bbox.lat_max}°, lon ${bbox.lon_min}° to ${bbox.lon_max}°.\n` +
      `Pick a point inside the basin to generate graphs.`
    );
  };

  const handleStationSelect = async (stationInfo) => {
    console.log('Station selected:', stationInfo?.Station);
    
    sendSelectedStation(stationInfo).catch(console.error);
    // Open panel immediately when station is selected
    setIsPanelHidden(false);
    setSelectedStationInfo(stationInfo || null);
    setSelectedSubbasinInfo(null);
    // Prosleđuje naziv stanice
    loadStationChart(stationInfo.Station);
  };

  const handleSubbasinSelectStart = () => {
    setIsLoadingSubbasin(true);
    setShowChart(false);
    setChartData(null);
    // Open panel immediately when subbasin selection starts
    setIsPanelHidden(false);
    setSelectedSubbasinInfo(null);
    setSelectedStationInfo(null);
  };

  const handleSubbasinSelect = (subbasinInfo) => {
    if (subbasinInfo.id) {
      // Ensure panel is open when subbasin is selected
      setIsPanelHidden(false);
      setSelectedSubbasinInfo(subbasinInfo || null);
      setSelectedStationInfo(null);
      loadSubbasinChart(subbasinInfo.id);
    }
  };

  const loadStationChart = async (stationName) => {
    if (!stationName) return;
    try {
      const data = await apiService.getStationGraph(stationName);
      if (data && !data.error) {
        setChartData(data);
        setChartType('station');
        setShowChart(true);
      } else {
        const msg = data?.error || 'Failed to load chart data';
        alert(msg);
      }
    } catch {
      alert('Failed to load chart data');
    }
  };

  const loadSubbasinChart = async (subbasinId) => {
    if (!subbasinId) return;
    try {
      const data = await apiService.getSubbasinGraph(subbasinId);
      if (data && !data.error) {
        setChartData(data);
        setChartType('subbasin');
        setShowChart(true);
      } else {
        const msg = data?.details || data?.message || data?.error || 'Unknown error';
        alert(`Failed to load chart data for subbasin ${subbasinId}\nError: ${msg}`);
      }
    } catch (error) {
      alert(`Failed to load subbasin chart data\nError: ${error.message || error}`);
    } finally {
      setIsLoadingSubbasin(false);
    }
  };

  const handlePointSelectStart = () => {
    setIsLoadingPoint(true);
    setShowChart(false);
    setChartData(null);
    setSelectedStationInfo(null);
    setSelectedSubbasinInfo(null);
  };

  const handlePointSelect = (coordinates) => {
    if (!coordinates.lat || !coordinates.lon) return;
    const { lat, lon } = coordinates;

    // Client-side bbox guard: skip the API call entirely when we know the
    // backend can't possibly answer for this point.
    if (
      coverageBbox &&
      (lat < coverageBbox.lat_min ||
        lat > coverageBbox.lat_max ||
        lon < coverageBbox.lon_min ||
        lon > coverageBbox.lon_max)
    ) {
      setIsLoadingPoint(false);
      setPointProgress(null);
      alert(formatOutOfBboxMessage(lat, lon, coverageBbox));
      return;
    }

    loadPointChart(lat, lon);
  };

  const loadPointChart = async (lat, lon) => {
    if (!lat || !lon) return;
    abortControllerRef.current = new AbortController();
    setPointProgress(null);
    
    // Progress callback
    const handleProgress = (progressData) => {
      setPointProgress(progressData);
    };

    const handlePartial = (partialData) => {
      if (!partialData || !partialData.dataset) {
        return;
      }
      setChartType('point');
      setIsPanelHidden(false);
      setShowChart(true);
      setChartData((prev) => {
        const previousDatasets = prev?.datasets ?? [];
        const existingIndex = previousDatasets.findIndex(
          (ds) => ds.variable_name === partialData.dataset.variable_name
        );
        const updatedDatasets =
          existingIndex >= 0
            ? previousDatasets.map((ds, idx) => (idx === existingIndex ? partialData.dataset : ds))
            : [...previousDatasets, partialData.dataset];

        return {
          latitude: partialData.latitude ?? prev?.latitude ?? lat,
          longitude: partialData.longitude ?? prev?.longitude ?? lon,
          datasets: updatedDatasets,
          progress: partialData.progress ?? prev?.progress ?? null,
        };
      });
    };
    
    try {
      const data = await apiService.getPointData(lat, lon, {
        onProgress: handleProgress,
        onPartial: handlePartial,
        signal: abortControllerRef.current.signal,
      });
      if (data && !data.error) {
        setChartData(data);
        setChartType('point');
        setShowChart(true);
        setIsPanelHidden(false);
      } else {
        const msg = data?.details || data?.message || data?.error || 'Unknown error';
        alert(`Failed to load chart data for location (${lat}, ${lon})\nError: ${msg}`);
      }
    } catch (error) {
      if (error.message === 'Request cancelled') {
        // user cancelled, no alert
      } else if (error.code === 'OUT_OF_BBOX' || error.code === 'NO_DATA_AT_POINT') {
        const bbox = error.coverage || coverageBbox;
        if (error.code === 'NO_DATA_AT_POINT') {
          alert(
            `No data available at this location (lat ${lat.toFixed(4)}, lon ${lon.toFixed(4)}).\n` +
            `The point is inside the Danube bbox but outside the watershed mask — pick a point closer to the rivers.`
          );
        } else {
          alert(formatOutOfBboxMessage(lat, lon, bbox) || `Location (${lat}, ${lon}) is outside the data coverage.`);
        }
      } else {
        alert(`Failed to load point chart data\nError: ${error.message || error}`);
      }
    } finally {
      setIsLoadingPoint(false);
      setPointProgress(null);
      abortControllerRef.current = null;
    }
  };

  const closeChart = () => {
    setShowChart(false);
    setChartData(null);
    setChartType('station');
    setSelectedStationInfo(null);
    setSelectedSubbasinInfo(null);
    setIsPanelHidden(true);
    if (mapInstance.current && mapInstance.current.clearAllSelections) {
      mapInstance.current.clearAllSelections();
    } else if (mapInstance.current && mapInstance.current.clearSelectedSubbasin) {
      mapInstance.current.clearSelectedSubbasin();
    }
  };

  const cancelPointLoading = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoadingPoint(false);
    setPointProgress(null);
  };

  const handleDateRangeChange = useCallback((range) => {
    setGlobalDateRange({
      startDate: range.start,
      endDate: range.end
    });
  }, []);

  const handleMapReady = (map) => {
    mapInstance.current = map;
  };

  const stationSummaryRows = useMemo(() => {
    if (!selectedStationInfo) return [];
    const formatCoord = (value) => {
      if (value === null || value === undefined || Number.isNaN(value)) return null;
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (Number.isFinite(num)) {
        return num.toFixed(3);
      }
      return null;
    };
    const formatMetric = (value, digits = 2) => {
      if (value === null || value === undefined) return null;
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(num)) return null;
      return num.toFixed(digits);
    };

    const lat = formatCoord(selectedStationInfo.lat);
    const lon = formatCoord(selectedStationInfo.lon);

    return [
      { label: 'Station', value: selectedStationInfo.Station },
      { label: 'Coordinates', value: lat && lon ? `${lat}, ${lon}` : null },
      { label: 'River', value: selectedStationInfo.River },
      { label: 'Subbasin', value: selectedStationInfo.Subbasin },
      { label: 'Country', value: selectedStationInfo.Country },
      { label: 'KGE (Calibration)', value: formatMetric(selectedStationInfo.KGE_cal) },
      { label: 'KGE (Validation)', value: formatMetric(selectedStationInfo.KGE_val) }
    ].filter((row) => {
      if (row.value === null || row.value === undefined) return false;
      if (row.value === '' || row.value === 'N/A') return false;
      return true;
    });
  }, [selectedStationInfo]);

  const subbasinSummaryRows = useMemo(() => {
    if (!selectedSubbasinInfo) return [];
    const formatNumber = (value, options = {}) => {
      if (value === null || value === undefined) return null;
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(num)) return null;
      return new Intl.NumberFormat('en-US', options).format(num);
    };

    const rawArea =
      selectedSubbasinInfo.area ??
      selectedSubbasinInfo.SUB_AREA ??
      selectedSubbasinInfo.sub_area ??
      null;
    const areaKm2 =
      rawArea !== null && rawArea !== undefined
        ? (() => {
            const num = typeof rawArea === 'number' ? rawArea : parseFloat(rawArea);
            return Number.isFinite(num) ? num / 1_000_000 : null;
          })()
        : null;

    return [
      { label: 'Station', value: selectedSubbasinInfo.Station },
      { label: 'Subbasin', value: selectedSubbasinInfo.Subbasin || selectedSubbasinInfo.subbasin_name },
      { label: 'Country', value: selectedSubbasinInfo.Country },
      { label: 'River', value: selectedSubbasinInfo.River },
      { label: 'Area (km²)', value: areaKm2 !== null ? formatNumber(areaKm2, { maximumFractionDigits: 0 }) : null }
    ].filter((row) => {
      if (row.value === null || row.value === undefined) return false;
      if (row.value === '' || row.value === 'N/A') return false;
      return true;
    });
  }, [selectedSubbasinInfo]);

  const renderSummaryTable = (title, rows) => {
    if (!rows || rows.length === 0) return null;
    return (
      <div className="selection-summary">
        <div className="selection-summary-header">{title}</div>
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="selection-summary-label">{row.label}</td>
                <td className="selection-summary-value">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };


  // Drive both isPanelAnimating and the OpenLayers updateSize() off the same
  // signal: the .charts-panel transitionend (for width/height swaps) or a
  // 500 ms safety fallback (for cases where the panel just mounted or the
  // browser swallowed the transitionend — e.g. background tab). Replaces the
  // previous magic-450ms setTimeout so chart resize work happens exactly once,
  // synchronously with the end of the visible animation.
  useEffect(() => {
    setIsPanelAnimating(true);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setIsPanelAnimating(false);
      if (mapInstance.current) {
        mapInstance.current.updateSize();
      }
    };

    const panel = chartsPanelRef.current;
    const handleTransitionEnd = (e) => {
      if (e.target !== panel) return;
      if (e.propertyName !== 'width' && e.propertyName !== 'height') return;
      finish();
    };

    if (panel) {
      panel.addEventListener('transitionend', handleTransitionEnd);
    }

    const fallback = setTimeout(finish, 500);

    return () => {
      clearTimeout(fallback);
      if (panel) {
        panel.removeEventListener('transitionend', handleTransitionEnd);
      }
    };
  }, [showChart, isLoadingSubbasin, isLoadingPoint, isChartsExpanded]);


  // Export handlers registry for "Download All" toolbar.
  // Map<id, { getCsv: () => fn[], getPng: () => fn[] }> where getters read the
  // child's live handler arrays at click time — avoids snapshot/race issues.
  const exportHandlersRef = useRef(new Map());

  const registerExportHandlers = useCallback((entry) => {
    if (!entry || !entry.id) return () => {};
    exportHandlersRef.current.set(entry.id, {
      getCsv: typeof entry.getCsv === 'function' ? entry.getCsv : () => [],
      getPng: typeof entry.getPng === 'function' ? entry.getPng : () => [],
    });
    return () => {
      exportHandlersRef.current.delete(entry.id);
    };
  }, []);

  const collectExportFns = useCallback((kind) => {
    const fns = [];
    exportHandlersRef.current.forEach((entry) => {
      const arr = kind === 'csv' ? entry.getCsv() : entry.getPng();
      if (Array.isArray(arr)) {
        arr.forEach(fn => { if (typeof fn === 'function') fns.push(fn); });
      }
    });
    return fns;
  }, []);

  const runDownloadAll = useCallback(async (kind, zipFilename) => {
    try {
      const fns = collectExportFns(kind);
      const results = fns.map(fn => fn()).filter(Boolean);
      const resolved = (await Promise.all(results)).filter(Boolean);
      if (resolved.length === 0) {
        // eslint-disable-next-line no-alert
        alert('No chart data available to download yet. Wait for charts to finish loading and try again.');
        return;
      }
      await downloadAsZip(zipFilename, resolved);
    } catch (err) {
      console.error('Download all failed:', err);
      // eslint-disable-next-line no-alert
      alert(`Download failed: ${err?.message || err}`);
    }
  }, [collectExportFns]);

  const buildZipName = useCallback((kind) => {
    const base = kind === 'csv' ? 'charts_data' : 'charts_images';
    const rawName =
      chartType === 'subbasin' && selectedSubbasinInfo
        ? selectedSubbasinInfo.Subbasin || selectedSubbasinInfo.subbasin_name
        : null;
    const suffix = rawName ? `_${sanitizeFilename(rawName)}` : '';
    return `${base}${suffix}.zip`;
  }, [chartType, selectedSubbasinInfo]);

  const handleDownloadAllCSV = useCallback(
    () => runDownloadAll('csv', buildZipName('csv')),
    [runDownloadAll, buildZipName]
  );

  const handleDownloadAllPNG = useCallback(
    () => runDownloadAll('png', buildZipName('png')),
    [runDownloadAll, buildZipName]
  );

  // Prevent body scroll when geoportal is active
  useEffect(() => {
    document.body.classList.add('geoportal-active');
    return () => {
      document.body.classList.remove('geoportal-active');
    };
  }, []);

  // Novi uslov: desni panel se NE otvara tokom point učitavanja ili je eksplicitno sakriven
  const showRightPanel = !isPanelHidden && (showChart || isLoadingSubbasin);

  // Wider than showRightPanel: also true while a point load is in flight, so
  // switching from an open chart to a point doesn't bounce the date picker
  // back to bottom-center for the round-trip. When the panel is fully hidden
  // (initial point click from a closed state), this stays false.
  const isChartPanelOpen =
    !isPanelHidden && (showChart || isLoadingSubbasin || isLoadingPoint);

  return (
    <div className={`geoportal-container ${showRightPanel ? 'has-chart' : ''} ${isChartsExpanded ? 'expanded' : ''} ${isPanelAnimating ? 'animating' : ''}`}>
      <div className="map-wrapper">
        <MapComponent
          stationsData={stationsData}
          subbasinsData={subbasinsData}
          onStationSelect={handleStationSelect}
          onSubbasinSelect={handleSubbasinSelect}
          onSubbasinSelectStart={handleSubbasinSelectStart}
          onPointSelect={handlePointSelect}
          onPointSelectStart={handlePointSelectStart}
          coverageBbox={coverageBbox}
          onMapReady={handleMapReady}
          isLoadingPoint={isLoadingPoint}
          pointProgress={pointProgress}
          onCancelLoading={cancelPointLoading}
          onDateRangeChange={handleDateRangeChange}
          onTogglePanel={togglePanelVisibility}
          isPanelHidden={isPanelHidden}
          isChartPanelOpen={isChartPanelOpen}
          isChartsExpanded={isChartsExpanded}
          onToggleChartsExpanded={toggleChartsExpanded}
        />
      </div>

      {showRightPanel && (
        <div className="charts-panel" ref={chartsPanelRef}>
          {(isLoadingSubbasin) && (
            <div className="subbasin-loader no-close">
              <div className="loader-content loader-content-no-close">
                <div className="loader-spinner"></div>
                <div className="loader-text">Loading subbasin data...</div>
              </div>
            </div>
          )}

          {showChart && chartData && (
            <>
              <div className="charts-panel-toolbar">
                <button className="charts-panel-toolbar-btn" onClick={handleDownloadAllCSV} title="Download all data as CSV">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download All CSV
                </button>
                <button className="charts-panel-toolbar-btn" onClick={handleDownloadAllPNG} title="Download all charts as PNG">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Download All PNG
                </button>
                <button className="charts-panel-toolbar-close" onClick={closeChart} title="Close graphs" aria-label="Close graphs">✕</button>
              </div>

              {chartType === 'station' && (
                <>
                  {renderSummaryTable('Selected Station', stationSummaryRows)}
                  <StationChart
                    graphData={chartData}
                    subbasinName={selectedStationInfo?.Subbasin}
                    dateRange={globalDateRange}
                    registerExportHandlers={registerExportHandlers}
                    isPanelAnimating={isPanelAnimating}
                  />
                </>
              )}

              {chartType === 'subbasin' && (
                <div className="subbasin-layout-container">
                  <div className="subbasin-top-row">
                    <div className="subbasin-info-col">
                      {renderSummaryTable('Selected Subbasin', subbasinSummaryRows)}
                    </div>
                    <div className="subbasin-pie-col">
                      <WaterBalancePieChart
                        graphData={chartData}
                        dateRange={globalDateRange}
                        registerExportHandlers={registerExportHandlers}
                        isPanelAnimating={isPanelAnimating}
                        subbasinAreaM2={selectedSubbasinInfo?.area ?? selectedSubbasinInfo?.SUB_AREA ?? selectedSubbasinInfo?.sub_area ?? null}
                        subbasinName={selectedSubbasinInfo?.Subbasin || selectedSubbasinInfo?.subbasin_name}
                        onExpand={() => setIsSubbasinPieFullscreen(true)}
                        expandBtnRef={subbasinPieExpandBtnRef}
                        titleId={isSubbasinPieFullscreen ? subbasinPieFsTitleId : undefined}
                      />
                      <ChartFullscreenModal
                        isOpen={isSubbasinPieFullscreen}
                        onClose={() => setIsSubbasinPieFullscreen(false)}
                        titleId={subbasinPieFsTitleId}
                        openerRef={subbasinPieExpandBtnRef}
                      >
                        <WaterBalancePieChart
                          graphData={chartData}
                          dateRange={globalDateRange}
                          isPanelAnimating={false}
                          subbasinAreaM2={selectedSubbasinInfo?.area ?? selectedSubbasinInfo?.SUB_AREA ?? selectedSubbasinInfo?.sub_area ?? null}
                          subbasinName={selectedSubbasinInfo?.Subbasin || selectedSubbasinInfo?.subbasin_name}
                          isFullscreen
                          titleId={subbasinPieFsTitleId}
                          onClose={() => setIsSubbasinPieFullscreen(false)}
                        />
                      </ChartFullscreenModal>
                    </div>
                  </div>

                  <div className="parquet-charts-half">
                    <SubbasinChart
                      graphData={chartData}
                      subbasinName={selectedSubbasinInfo?.Subbasin || selectedSubbasinInfo?.subbasin_name}
                      dateRange={globalDateRange}
                      hidePieChart={true}
                      registerExportHandlers={registerExportHandlers}
                      isPanelAnimating={isPanelAnimating}
                    />
                  </div>
                </div>
              )}

              {chartType === 'point' && (
                <PointGraph
                  graphData={chartData}
                  dateRange={globalDateRange}
                  progress={pointProgress}
                  registerExportHandlers={registerExportHandlers}
                  isPanelAnimating={isPanelAnimating}
                />
              )}
            </>
          )}

          {!isLoadingSubbasin && !showChart && (
            <div className="no-graph-message">
              <div className="no-graph-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
              </div>
              <div className="no-graph-text">No graph generated</div>
              <div className="no-graph-subtext">Select a station, subbasin, or point on the map to generate a graph</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Geoportal;
