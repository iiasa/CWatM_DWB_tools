import React, { useRef, useState, useCallback, useEffect, useId } from 'react';
import Graph from './Graph';
import WaterBalancePieChart from './WaterBalancePieChart';
import ChartFullscreenModal from './ChartFullscreenModal';
import { downloadCSV, downloadChartPNG, buildCSV, buildChartPNG, formatDateForFilename, sanitizeFilename } from '../utils/exportUtils';
import { getDisplayConfig, getAxisLabelLines } from '../config/layerLegendConfig';
import './StationChart.css';

/**
 * SubbasinChart - Component for displaying multiple subbasin charts stacked vertically
 * @param {Object} props
 * @param {Object} props.graphData - Subbasin graph data from API
 * @param {string} props.graphData.hybas_id - HYBAS ID
 * @param {Array} props.graphData.datasets - Array of datasets [{column_name, data_points, total_points}]
 * @param {Function} props.onClose - Close callback
 * @param {Object} props.dateRange - Date range filter {startDate, endDate}
 * @param {boolean} props.hidePieChart - Whether to hide the WaterBalancePieChart
 * @param {Function} props.registerExportHandlers - Callback to register export handlers with parent
 */
const SubbasinChart = ({ graphData, subbasinName, onClose, dateRange, hidePieChart = false, registerExportHandlers, isPanelAnimating = false }) => {
  const chartRefsMap = useRef({});
  const fullscreenChartRefsMap = useRef({});
  const expandBtnRefsMap = useRef({});
  const exportHandlersRef = useRef({ csv: [], png: [] });
  const exportId = useId();
  const fsTitleId = useId();
  // fsKey is 'pie' | column_name | null. Single modal mounted at a time.
  const [fsKey, setFsKey] = useState(null);
  const hasData = graphData && graphData.datasets && graphData.datasets.length > 0;

  // Create a stable ref getter for chart instances
  const getChartRef = useCallback((columnName) => {
    if (!chartRefsMap.current[columnName]) {
      chartRefsMap.current[columnName] = { current: null };
    }
    return chartRefsMap.current[columnName];
  }, []);

  const getFullscreenChartRef = useCallback((columnName) => {
    if (!fullscreenChartRefsMap.current[columnName]) {
      fullscreenChartRefsMap.current[columnName] = { current: null };
    }
    return fullscreenChartRefsMap.current[columnName];
  }, []);

  const getExpandBtnRef = useCallback((key) => {
    if (!expandBtnRefsMap.current[key]) {
      expandBtnRefsMap.current[key] = { current: null };
    }
    return expandBtnRefsMap.current[key];
  }, []);

  // Rebuild per-dataset handlers fresh on every render. Assigning during
  // render (rather than in an effect) guarantees the arrays reflect the
  // current dataset list by the time the parent's "Download All" reads them —
  // a post-commit reset effect would wipe handlers that renderChart() just
  // populated below, which is what caused "No chart data available" after
  // charts loaded successfully.
  exportHandlersRef.current = { csv: [], png: [] };

  // Register export handlers with parent for "Download All". The getters read
  // the live arrays at click time, so per-dataset handlers populated during
  // render are picked up regardless of effect ordering.
  useEffect(() => {
    if (!registerExportHandlers) return undefined;
    const unregister = registerExportHandlers({
      id: exportId,
      getCsv: () => exportHandlersRef.current.csv.filter(Boolean),
      getPng: () => exportHandlersRef.current.png.filter(Boolean),
    });
    return unregister;
  }, [registerExportHandlers, exportId]);

  if (!hasData) {
    return (
      <Graph
        type="line"
        title={`Subbasin ${graphData?.hybas_id || 'Data'}`}
        subtitle="No data available"
        onClose={onClose}
        data={{ labels: [], datasets: [] }}
        className="station-chart"
        isPanelAnimating={isPanelAnimating}
      />
    );
  }

  // Build per-column display info. Visual metadata (label, color) stays local;
  // unit and decimals are sourced from LAYER_DISPLAY_CONFIG via the shared
  // alias map so unit changes propagate from one place.
  const getColumnInfo = (columnName) => {
    const BLUE = '#1E88E5';
    const ORANGE = '#FB8C00';

    const info = {
      // INPUTS - Blue shades (Rain, Snow, ET)
      'danube_Rain_monthly_avg':         { label: 'Rain (Avg)', color: '#1565C0' },
      'danube_Rain_monthly_sum':         { label: 'Rain (Sum)', color: BLUE },
      'danube_Snow_monthly_avg':         { label: 'Snow (Avg)', color: '#42A5F5' },
      'danube_Snow_monthly_sum':         { label: 'Snow (Sum)', color: '#64B5F6' },
      'danube_IceMelt_monthly_avg':      { label: 'Ice Melt (Avg)', color: '#90CAF9' },
      'danube_IceMelt_monthly_sum':      { label: 'Ice Melt (Sum)', color: '#BBDEFB' },
      'danube_SnowMelt_monthly_avg':     { label: 'Snow Melt (Avg)', color: '#2196F3' },
      'danube_SnowMelt_monthly_sum':     { label: 'Snow Melt (Sum)', color: '#1976D2' },
      'danube_SnowFraction_monthly_avg': { label: 'Snow Fraction (Avg)', color: '#82B1FF' },
      'danube_SnowFraction_monthly_sum': { label: 'Snow Fraction (Sum)', color: '#448AFF' },
      'danube_totalET_WB_monthly_avg':   { label: 'Total ET Water Bodies (Avg)', color: '#1976D2' },
      'danube_totalET_WB_monthly_sum':   { label: 'Total ET Water Bodies (Sum)', color: '#1E88E5' },
      'danube_ETRef_monthly_avg':        { label: 'Reference Evapotranspiration (Avg)', color: '#42A5F5' },
      'danube_ETRef_monthly_sum':        { label: 'Reference Evapotranspiration (Sum)', color: '#64B5F6' },
      'danube_SoilMoisture_monthly_avg': { label: 'Soil Moisture (Avg)', color: '#66BB6A' },
      'danube_SoilMoisture_monthly_sum': { label: 'Soil Moisture (Sum)', color: '#81C784' },
      'danube_soilMoisture_monthly_avg': { label: 'Soil Moisture (Avg)', color: '#66BB6A' },
      'danube_soilMoisture_monthly_sum': { label: 'Soil Moisture (Sum)', color: '#81C784' },
      // OUTPUTS - Orange shades (Discharge, runoff, tws)
      // Discharge intentionally excluded from subbasin charts — see
      // get_subbasin_data.py target_cols. Uncomment both backend and these
      // frontend entries together to re-enable.
      // 'danube_discharge_monthly_avg':    { label: 'Discharge (Avg)', color: '#F57C00' },
      // 'danube_discharge_monthly_sum':    { label: 'Discharge (Sum)', color: '#FF6F00' },
      'danube_runoff_monthly_avg':       { label: 'Runoff (Avg)', color: '#FF9800' },
      'danube_runoff_monthly_sum':       { label: 'Runoff (Sum)', color: '#FFA726' },
      'danube_tws_monthly_avg':          { label: 'Total Water Storage (Avg)', color: '#EF6C00' },
      'danube_tws_monthly_sum':          { label: 'Total Water Storage (Sum)', color: ORANGE },
    };

    let base;
    if (info[columnName]) {
      base = info[columnName];
    } else if (columnName && columnName.toLowerCase().includes('soil')) {
      base = { label: 'Soil Moisture', color: '#66BB6A' };
    } else {
      base = { label: columnName, color: 'rgb(0, 0, 0)' };
    }

    const cfg = getDisplayConfig(columnName);
    if (!cfg) {
      console.warn(`[SubbasinChart] No LAYER_DISPLAY_CONFIG entry for column "${columnName}"`);
    }

    return {
      ...base,
      columnName,
      unit: cfg ? cfg.unit : '',
      decimals: cfg ? cfg.decimals : 2,
      factor: cfg ? cfg.factor : 1,
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

  // Build the Chart.js config + per-dataset download closures. Pure
  // derivation — no side effects, so renderChart (side panel) and
  // renderFullscreenChart (in modal) can share it without double-registering.
  const buildDatasetView = (dataset, chartRefForDataset) => {
    const rawFiltered = filterDataByDateRange(dataset.data_points);
    const columnInfo = getColumnInfo(dataset.column_name);
    const filteredData = rawFiltered.map(p => ({
      date: p.date,
      value: p.value * columnInfo.factor,
    }));
    const optimizedData = optimizeData(filteredData);

    const handleDownloadCSV = () => {
      const startDate = formatDateForFilename(dateRange?.startDate || filteredData[0]?.date);
      const endDate = formatDateForFilename(dateRange?.endDate || filteredData[filteredData.length - 1]?.date);
      const label = sanitizeFilename(columnInfo.label);
      const filename = `${graphData.hybas_id}_${label}_${startDate}_${endDate}.csv`;
      const headers = ['date', columnInfo.label];
      const rows = filteredData.map(p => [p.date, p.value]);
      downloadCSV(filename, headers, rows);
    };

    const handleDownloadPNG = () => {
      const ref = chartRefForDataset.current;
      const chart = ref?.chartInstance || ref;
      const label = sanitizeFilename(columnInfo.label);
      downloadChartPNG(chart, `${graphData.hybas_id}_${label}.png`);
    };

    const chartData = {
      labels: optimizedData.map(point => point.date),
      datasets: [
        {
          label: columnInfo.label,
          data: optimizedData.map(point => point.value),
          borderColor: columnInfo.color,
          backgroundColor: columnInfo.color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
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
              return `${columnInfo.label}: ${context.parsed.y.toFixed(columnInfo.decimals)} ${columnInfo.unit}`;
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
            text: 'Time',
            font: {
              size: 11
            }
          },
          ticks: {
            maxRotation: 0,
            autoSkipPadding: 20,
            font: {
              size: 10
            },
            maxTicksLimit: 8,
          }
        },
        y: {
          title: {
            // Two-line title: line 1 is the variable name, line 2 the unit in
            // parentheses (e.g. ["Reference Evapotranspiration", "(mm/month)"]).
            // Keeps the rotated label short enough to fit narrow chart cards.
            display: true,
            text: getAxisLabelLines(columnInfo.columnName),
            font: {
              size: 11
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

    return { columnInfo, filteredData, chartData, options, handleDownloadCSV, handleDownloadPNG };
  };

  // Render individual chart for each dataset
  const renderChart = (dataset, index) => {
    const chartRefForDataset = getChartRef(dataset.column_name);
    const view = buildDatasetView(dataset, chartRefForDataset);
    const { columnInfo, filteredData, chartData, options, handleDownloadCSV, handleDownloadPNG } = view;

    // Register collector functions for panel-level "Download All" (return file data, don't trigger download)
    exportHandlersRef.current.csv[index] = () => {
      const startDate = formatDateForFilename(dateRange?.startDate || filteredData[0]?.date);
      const endDate = formatDateForFilename(dateRange?.endDate || filteredData[filteredData.length - 1]?.date);
      const label = sanitizeFilename(columnInfo.label);
      const filename = `${graphData.hybas_id}_${label}_${startDate}_${endDate}.csv`;
      return buildCSV(filename, ['date', columnInfo.label], filteredData.map(p => [p.date, p.value]));
    };
    exportHandlersRef.current.png[index] = () => {
      const ref = chartRefForDataset.current;
      const chart = ref?.chartInstance || ref;
      const label = sanitizeFilename(columnInfo.label);
      return buildChartPNG(chart, `${graphData.hybas_id}_${label}.png`);
    };

    return (
      <Graph
        key={dataset.column_name}
        type="line"
        title={`Subbasin ${subbasinName || graphData.hybas_id} - ${columnInfo.label}`}
        subtitle=""
        data={chartData}
        options={options}
        onClose={index === 0 ? onClose : undefined}
        className="station-chart"
        enableZoom={true}
        onDownloadCSV={handleDownloadCSV}
        onDownloadPNG={handleDownloadPNG}
        chartRefProp={chartRefForDataset}
        isPanelAnimating={isPanelAnimating}
        onExpand={() => setFsKey(dataset.column_name)}
        expandBtnRef={getExpandBtnRef(dataset.column_name)}
        titleId={fsKey === dataset.column_name ? fsTitleId : undefined}
      />
    );
  };

  // Re-render the active chart inside the fullscreen modal. Re-derives the
  // same Chart.js config (data flows through props from Geoportal state, so
  // both instances stay in sync). Does NOT register download handlers — the
  // side-panel chart owns the registration so "Download All" doesn't dupe.
  const renderFullscreenChart = (dataset) => {
    if (!dataset) return null;
    const fsChartRef = getFullscreenChartRef(dataset.column_name);
    const view = buildDatasetView(dataset, fsChartRef);
    const { columnInfo, chartData, options, handleDownloadCSV, handleDownloadPNG } = view;
    return (
      <Graph
        key={`${dataset.column_name}-fs`}
        type="line"
        title={`Subbasin ${subbasinName || graphData.hybas_id} - ${columnInfo.label}`}
        subtitle=""
        data={chartData}
        options={options}
        className="station-chart"
        enableZoom={true}
        onDownloadCSV={handleDownloadCSV}
        onDownloadPNG={handleDownloadPNG}
        chartRefProp={fsChartRef}
        isPanelAnimating={false}
        isFullscreen
        titleId={fsTitleId}
        onClose={() => setFsKey(null)}
      />
    );
  };

  const activeDataset = fsKey && fsKey !== 'pie'
    ? graphData.datasets.find(d => d.column_name === fsKey)
    : null;

  return (
    <div className="subbasin-charts-stack">
      {/* Water Balance Pie Chart - displayed at the top (only if not hidden) */}
      {!hidePieChart && (
        <WaterBalancePieChart
          graphData={graphData}
          dateRange={dateRange}
          isPanelAnimating={isPanelAnimating}
          subbasinName={subbasinName}
          onExpand={() => setFsKey('pie')}
          expandBtnRef={getExpandBtnRef('pie')}
          titleId={fsKey === 'pie' ? fsTitleId : undefined}
        />
      )}

      {/* Individual time series charts */}
      {graphData.datasets.map((dataset, index) => renderChart(dataset, index))}

      <ChartFullscreenModal
        isOpen={fsKey !== null}
        onClose={() => setFsKey(null)}
        titleId={fsTitleId}
        openerRef={fsKey ? getExpandBtnRef(fsKey) : null}
      >
        {fsKey === 'pie' ? (
          <WaterBalancePieChart
            graphData={graphData}
            dateRange={dateRange}
            isPanelAnimating={false}
            subbasinName={subbasinName}
            isFullscreen
            titleId={fsTitleId}
            onClose={() => setFsKey(null)}
          />
        ) : (
          renderFullscreenChart(activeDataset)
        )}
      </ChartFullscreenModal>
    </div>
  );
};

export default SubbasinChart;
