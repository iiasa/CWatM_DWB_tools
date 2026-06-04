import React, { useMemo, useState, useRef, useCallback, useEffect, useId } from 'react';
import Graph from './Graph';
import ChartFullscreenModal from './ChartFullscreenModal';
import { downloadCSV, downloadChartPNG, buildCSV, buildChartPNG, formatDateForFilename, sanitizeFilename } from '../utils/exportUtils';
import { getDisplayConfig, getAxisLabelLines } from '../config/layerLegendConfig';
import './StationChart.css';

/**
 * PointGraph - Component for displaying point data with time series charts only
 * @param {Object} props
 * @param {Object} props.graphData - Point graph data from API
 * @param {number} props.graphData.latitude - Latitude
 * @param {number} props.graphData.longitude - Longitude
 * @param {Array} props.graphData.datasets - Array of datasets [{variable_name, data_points, total_points}]
 * @param {Function} props.onClose - Close callback
 * @param {Object} props.dateRange - Date range filter {startDate, endDate}
 */
const PointGraph = ({ graphData, onClose, dateRange, progress, registerExportHandlers, isPanelAnimating = false }) => {
  const datasets = useMemo(() => graphData?.datasets ?? [], [graphData]);
  const chartRefsMap = useRef({});
  const fullscreenChartRefsMap = useRef({});
  const expandBtnRefsMap = useRef({});
  const exportHandlersRef = useRef({ csv: [], png: [] });
  const exportId = useId();
  const fsTitleId = useId();
  // fsKey is variable_name | null. Single modal mounted at a time.
  const [fsKey, setFsKey] = useState(null);
  const totalTasks = typeof progress?.total === 'number' ? progress.total : null;
  const completedTasks = typeof progress?.completed === 'number' ? progress.completed : null;
  const hasPendingDatasets =
    totalTasks !== null &&
    completedTasks !== null &&
    totalTasks > 0 &&
    completedTasks < totalTasks;

  const hexToRgba = (hex, alpha = 1) => {
    const normalized = hex.replace('#', '');
    const bigint = parseInt(normalized.length === 3 ? normalized.repeat(2) : normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getFillColor = (color) => {
    if (!color) return 'rgba(30, 136, 229, 0.1)';
    if (color.startsWith('#')) {
      return hexToRgba(color, 0.12);
    }
    if (color.startsWith('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', ', 0.12)');
    }
    return color;
  };

  // Build dataset display info. Visual metadata (label, color) lives here;
  // unit and decimals are sourced from LAYER_DISPLAY_CONFIG so the whole app
  // stays in sync when units change.
  const getDatasetInfo = (dataset) => {
    const fileKey = dataset?.file_name?.toLowerCase() || null;
    const variableName = dataset?.variable_name || '';

    const infoByFile = {
      'danube_discharge_monthly.nc':    { label: 'Discharge', color: '#F57C00' },
      'danube_runoff_monthly.nc':       { label: 'Runoff', color: '#FF9800' },
      'danube_tws_monthly.nc':          { label: 'Total Water Storage', color: '#EF6C00' },
      'danube_rain_monthly.nc':         { label: 'Rain', color: '#1565C0' },
      'danube_snow_monthly.nc':         { label: 'Snow', color: '#42A5F5' },
      'danube_snowfraction_monthly.nc': { label: 'Snow Fraction', color: '#82B1FF' },
      'danube_snowmelt_monthly.nc':     { label: 'Snow Melt', color: '#2196F3' },
      'danube_icemelt_monthly.nc':      { label: 'Ice Melt', color: '#90CAF9' },
      'danube_totalet_wb_monthly.nc':   { label: 'Total ET Water Bodies', color: '#1976D2' },
      'danube_etref_monthly.nc':        { label: 'Reference Evapotranspiration', color: '#42A5F5' },
      'discharge_monthavg.nc':          { label: 'Discharge (Monthly Avg)', color: '#F57C00' },
      'snowfraction_monthavg.nc':       { label: 'Snow Fraction (Monthly Avg)', color: '#82B1FF' },
    };

    const infoByName = {
      'Rain':          { label: 'Rain', color: '#1565C0' },
      'Snow':          { label: 'Snow', color: '#42A5F5' },
      'Snow Melt':     { label: 'Snow Melt', color: '#2196F3' },
      'Ice Melt':      { label: 'Ice Melt', color: '#90CAF9' },
      'Snow Fraction': { label: 'Snow Fraction', color: '#82B1FF' },
      'Snowfraction':  { label: 'Snow Fraction', color: '#82B1FF' },
      'Totalet Wb':    { label: 'Total ET Water Bodies', color: '#1976D2' },
      'Etref':         { label: 'Reference Evapotranspiration', color: '#42A5F5' },
      'Precipitation': { label: 'Precipitation', color: '#1976D2' },
      'Snow Cover':    { label: 'Snow Cover', color: '#64B5F6' },
      'Glacier Melt':  { label: 'Glacier Melt', color: '#90CAF9' },
      'Soil Moisture': { label: 'Soil Moisture', color: '#66BB6A' },
      'Runoff':        { label: 'Runoff', color: '#FF9800' },
      'Discharge':     { label: 'Discharge', color: '#F57C00' },
      'Tws':           { label: 'Total Water Storage', color: '#EF6C00' },
    };

    let base;
    if (fileKey && infoByFile[fileKey]) {
      base = infoByFile[fileKey];
    } else if (infoByName[variableName]) {
      base = infoByName[variableName];
    } else if (variableName && variableName.toLowerCase().includes('soil')) {
      base = { label: 'Soil Moisture', color: '#66BB6A' };
    } else {
      base = { label: variableName || 'Dataset', color: '#1E88E5' };
    }

    const cfg = getDisplayConfig(fileKey) || getDisplayConfig(variableName);
    if (!cfg) {
      // Every CWatM variable the backend can emit should have an entry in
      // LAYER_DISPLAY_CONFIG. Warn loudly so a new variable does not silently
      // ship with no units.
      console.warn(`[PointGraph] No LAYER_DISPLAY_CONFIG entry for fileKey="${fileKey}" variable="${variableName}"`);
    }

    return {
      ...base,
      identifier: fileKey || variableName,
      factor: cfg ? cfg.factor : 1,
      unit: cfg ? cfg.unit : '',
      decimals: cfg ? cfg.decimals : 2,
    };
  };

  // Filter data by date range
  const filterDataByDateRange = (dataPoints) => {
    if (!dateRange || !dateRange.startDate || !dateRange.endDate) {
      return dataPoints;
    }
    
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    
    return dataPoints.filter(point => {
      const pointDate = new Date(point.date);
      return pointDate >= startDate && pointDate <= endDate;
    });
  };

  // Optimize data for better performance
  const optimizeData = (dataPoints) => {
    if (dataPoints.length > 1000) {
      const step = Math.ceil(dataPoints.length / 1000);
      return dataPoints.filter((_, index) => index % step === 0);
    }
    return dataPoints;
  };

  // Create a stable ref getter for chart instances
  const getChartRef = useCallback((key) => {
    if (!chartRefsMap.current[key]) {
      chartRefsMap.current[key] = { current: null };
    }
    return chartRefsMap.current[key];
  }, []);

  const getFullscreenChartRef = useCallback((key) => {
    if (!fullscreenChartRefsMap.current[key]) {
      fullscreenChartRefsMap.current[key] = { current: null };
    }
    return fullscreenChartRefsMap.current[key];
  }, []);

  const getExpandBtnRef = useCallback((key) => {
    if (!expandBtnRefsMap.current[key]) {
      expandBtnRefsMap.current[key] = { current: null };
    }
    return expandBtnRefsMap.current[key];
  }, []);

  // Pure derivation of Chart.js config + per-dataset download closures.
  // Shared by renderChart (side panel, has side effects + handlers) and
  // renderFullscreenChart (in modal, no side effects).
  const buildDatasetView = (dataset, chartRefForDataset) => {
    const rawFiltered = filterDataByDateRange(dataset.data_points);
    const datasetInfo = getDatasetInfo(dataset);
    // Apply the display factor here so chart values, tooltips and CSV exports
    // all use the same converted magnitudes (mirrors SubbasinChart). Without
    // this, point values for Rain/Snow/etc. arrive in meters but get labeled
    // mm/month and show up 1000× too small.
    const filteredData = rawFiltered.map(p => ({
      date: p.date,
      value: Number(p.value) * datasetInfo.factor,
    }));
    const optimizedData = optimizeData(filteredData);
    const isDatasetLoading = !dataset.data_points || dataset.data_points.length === 0;

    const csvHeader = datasetInfo.unit
      ? `${datasetInfo.label} (${datasetInfo.unit})`
      : datasetInfo.label;

    const handleDownloadCSV = () => {
      const startDate = formatDateForFilename(dateRange?.startDate || filteredData[0]?.date);
      const endDate = formatDateForFilename(dateRange?.endDate || filteredData[filteredData.length - 1]?.date);
      const label = sanitizeFilename(datasetInfo.label);
      const lat = graphData.latitude.toFixed(4);
      const lon = graphData.longitude.toFixed(4);
      const filename = `point_${lat}_${lon}_${label}_${startDate}_${endDate}.csv`;
      const headers = ['date', csvHeader];
      const rows = filteredData.map(p => [p.date, p.value]);
      downloadCSV(filename, headers, rows);
    };

    const handleDownloadPNG = () => {
      const ref = chartRefForDataset.current;
      const chart = ref?.chartInstance || ref;
      const label = sanitizeFilename(datasetInfo.label);
      downloadChartPNG(chart, `point_${graphData.latitude.toFixed(4)}_${graphData.longitude.toFixed(4)}_${label}.png`);
    };

    const chartData = {
      labels: optimizedData.map(point => point.date),
      datasets: [
        {
          label: datasetInfo.label,
          data: optimizedData.map(point => point.value),
          borderColor: datasetInfo.color,
          backgroundColor: getFillColor(datasetInfo.color),
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
          fill: true,
          spanGaps: true,
        },
      ],
    };

    const options = {
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: {
              size: 11
            }
          }
        },
        title: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: function(context) {
              const date = new Date(context[0].parsed.x);
              return date.toLocaleDateString('en-GB', {
                month: 'short',
                year: 'numeric'
              });
            },
            label: function(context) {
              return `${datasetInfo.label}: ${context.parsed.y.toFixed(datasetInfo.decimals)} ${datasetInfo.unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'year',
            displayFormats: {
              year: 'yyyy'
            }
          },
          title: {
            display: true,
            text: 'Date',
            font: {
              size: 12,
              weight: 'bold'
            }
          },
          ticks: {
            font: {
              size: 10
            },
            maxTicksLimit: 8,
          }
        },
        y: {
          title: {
            display: true,
            text: getAxisLabelLines(datasetInfo.identifier),
            font: {
              size: 12,
              weight: 'bold'
            }
          },
          beginAtZero: false,
          ticks: {
            font: {
              size: 10
            },
            maxTicksLimit: 6,
          }
        },
      },
    };

    return {
      datasetInfo,
      filteredData,
      csvHeader,
      chartData,
      options,
      handleDownloadCSV,
      handleDownloadPNG,
      isDatasetLoading,
    };
  };

  // Render individual chart for each dataset
  const renderChart = (dataset, chartIndex) => {
    const chartKey = dataset.variable_name || `dataset_${chartIndex}`;
    const chartRefForDataset = getChartRef(chartKey);
    const view = buildDatasetView(dataset, chartRefForDataset);
    const { datasetInfo, filteredData, csvHeader, chartData, options, handleDownloadCSV, handleDownloadPNG, isDatasetLoading } = view;

    // Register collector functions for panel-level "Download All" (return file data, don't trigger download)
    if (chartIndex !== undefined) {
      exportHandlersRef.current.csv[chartIndex] = isDatasetLoading ? null : () => {
        const startDate = formatDateForFilename(dateRange?.startDate || filteredData[0]?.date);
        const endDate = formatDateForFilename(dateRange?.endDate || filteredData[filteredData.length - 1]?.date);
        const label = sanitizeFilename(datasetInfo.label);
        const lat = graphData.latitude.toFixed(4);
        const lon = graphData.longitude.toFixed(4);
        const filename = `point_${lat}_${lon}_${label}_${startDate}_${endDate}.csv`;
        return buildCSV(filename, ['date', csvHeader], filteredData.map(p => [p.date, p.value]));
      };
      exportHandlersRef.current.png[chartIndex] = () => {
        const ref = chartRefForDataset.current;
        const chart = ref?.chartInstance || ref;
        const label = sanitizeFilename(datasetInfo.label);
        return buildChartPNG(chart, `point_${graphData.latitude.toFixed(4)}_${graphData.longitude.toFixed(4)}_${label}.png`);
      };
    }

    return (
      <Graph
        key={dataset.variable_name}
        type="line"
        title={`Point (${graphData.latitude.toFixed(4)}°, ${graphData.longitude.toFixed(4)}°) - ${datasetInfo.label}`}
        subtitle=""
        data={chartData}
        options={options}
        className="station-chart"
        enableZoom={true}
        onDownloadCSV={isDatasetLoading ? undefined : handleDownloadCSV}
        onDownloadPNG={handleDownloadPNG}
        chartRefProp={chartRefForDataset}
        isPanelAnimating={isPanelAnimating}
        onExpand={isDatasetLoading ? undefined : () => setFsKey(chartKey)}
        expandBtnRef={getExpandBtnRef(chartKey)}
        titleId={fsKey === chartKey ? fsTitleId : undefined}
      />
    );
  };

  // Re-render the active chart inside the fullscreen modal. Data flows
  // through props from Geoportal state, so SSE partial updates land in both
  // instances automatically. Skips export-handler registration — the
  // side-panel chart owns it so "Download All" doesn't dupe.
  const renderFullscreenChart = (dataset) => {
    if (!dataset) return null;
    const chartKey = dataset.variable_name || 'dataset';
    const fsChartRef = getFullscreenChartRef(chartKey);
    const view = buildDatasetView(dataset, fsChartRef);
    const { datasetInfo, chartData, options, handleDownloadCSV, handleDownloadPNG, isDatasetLoading } = view;
    return (
      <Graph
        key={`${chartKey}-fs`}
        type="line"
        title={`Point (${graphData.latitude.toFixed(4)}°, ${graphData.longitude.toFixed(4)}°) - ${datasetInfo.label}`}
        subtitle=""
        data={chartData}
        options={options}
        className="station-chart"
        enableZoom={true}
        onDownloadCSV={isDatasetLoading ? undefined : handleDownloadCSV}
        onDownloadPNG={handleDownloadPNG}
        chartRefProp={fsChartRef}
        isPanelAnimating={false}
        isFullscreen
        titleId={fsTitleId}
        onClose={() => setFsKey(null)}
      />
    );
  };

  const { primaryDataset, additionalDatasets } = useMemo(() => {
    if (!datasets.length) {
      return { primaryDataset: null, additionalDatasets: [] };
    }

    const dischargeDataset = datasets.find(
      (dataset) =>
        typeof dataset.variable_name === 'string' &&
        dataset.variable_name.toLowerCase().includes('discharge')
    );
    const primary = dischargeDataset || datasets[0];
    const additional = datasets.filter((dataset) => dataset !== primary);
    return { primaryDataset: primary, additionalDatasets: additional };
  }, [datasets]);

  const [showAdditionalCharts, setShowAdditionalCharts] = useState(false);

  // Rebuild per-dataset handlers fresh on every render. Assigning during
  // render (rather than in an effect) guarantees the arrays reflect the
  // current dataset list by the time the parent's "Download All" reads them —
  // a post-commit reset effect would wipe handlers the child charts just
  // populated below, which is what caused "No chart data available" even
  // though datasets had streamed in successfully.
  exportHandlersRef.current = { csv: [], png: [] };

  // Register export handlers with parent for "Download All". Getters read the
  // live arrays at click time, so handlers registered during child render
  // (including progressively streamed datasets) are picked up automatically.
  useEffect(() => {
    if (!registerExportHandlers) return undefined;
    const unregister = registerExportHandlers({
      id: exportId,
      getCsv: () => exportHandlersRef.current.csv.filter(Boolean),
      getPng: () => exportHandlersRef.current.png.filter(Boolean),
    });
    return unregister;
  }, [registerExportHandlers, exportId]);

  if (!graphData || datasets.length === 0) {
    return (
      <Graph
        type="line"
        title={`Point (${graphData?.latitude?.toFixed(4) || 'N/A'}°, ${graphData?.longitude?.toFixed(4) || 'N/A'}°)`}
        subtitle="No data available"
        onClose={onClose}
        data={{ labels: [], datasets: [] }}
        className="station-chart"
        isPanelAnimating={isPanelAnimating}
      />
    );
  }

  return (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        background: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div 
        className="point-charts-stack"
        style={{ 
          padding: '10px', 
          height: '100%', 
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        {primaryDataset && renderChart(primaryDataset, 0)}

        {primaryDataset && hasPendingDatasets && (
          <div className="point-charts-progress-bar-wrapper">
            <div className="point-charts-processing-spinner" aria-hidden="true" />
            <div className="point-charts-progress-info">
              <span className="point-charts-progress-label">
                Loading remaining variables… {Math.max(completedTasks, 0)}/{totalTasks}
              </span>
              <div className="point-charts-progress-bar">
                <div
                  className="point-charts-progress-bar-fill"
                  style={{ width: `${totalTasks > 0 ? (Math.max(completedTasks, 0) / totalTasks) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {!hasPendingDatasets && additionalDatasets.length > 0 && (
          <div className="point-charts-toggle-wrapper">
            <button
              type="button"
              className="point-charts-toggle"
              onClick={() => setShowAdditionalCharts((prev) => !prev)}
            >
              {showAdditionalCharts
                ? 'Hide additional variables'
                : `Show ${additionalDatasets.length} more variable${additionalDatasets.length > 1 ? 's' : ''}`}
            </button>

            {showAdditionalCharts &&
              additionalDatasets.map((dataset, i) => renderChart(dataset, i + 1))}
          </div>
        )}
      </div>
      <ChartFullscreenModal
        isOpen={fsKey !== null}
        onClose={() => setFsKey(null)}
        titleId={fsTitleId}
        openerRef={fsKey ? getExpandBtnRef(fsKey) : null}
      >
        {fsKey !== null && renderFullscreenChart(
          datasets.find(d => (d.variable_name || '') === fsKey)
        )}
      </ChartFullscreenModal>
    </div>
  );
};

export default PointGraph;