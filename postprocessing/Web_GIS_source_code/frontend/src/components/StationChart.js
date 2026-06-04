import React, { useRef, useState, useCallback, useEffect, useId, useMemo } from 'react';
import Graph from './Graph';
import ChartFullscreenModal from './ChartFullscreenModal';
import { downloadCSV, downloadChartPNG, buildCSV, buildChartPNG, formatDateForFilename, sanitizeFilename } from '../utils/exportUtils';
import { LAYER_DISPLAY_CONFIG, getAxisLabel, getAxisLabelLines } from '../config/layerLegendConfig';
import './StationChart.css';

const DISCHARGE_CFG = LAYER_DISPLAY_CONFIG.Discharge;
const DISCHARGE_AXIS = getAxisLabel('Discharge');
const DISCHARGE_AXIS_LINES = getAxisLabelLines('Discharge');

/**
 * StationChart - Specialized component for displaying station discharge data
 * @param {Object} props
 * @param {Object} props.graphData - Station graph data from API
 * @param {string} props.graphData.station_name - Station name
 * @param {number} props.graphData.total_points - Total number of data points
 * @param {Array} props.graphData.data_points - Array of {date, discharge} objects
 * @param {Function} props.onClose - Close callback
 * @param {Object} props.dateRange - Date range filter {startDate, endDate}
 * @param {Function} props.registerExportHandlers - Callback to register export handlers with parent
 */
const StationChart = ({ graphData, subbasinName, onClose, dateRange, registerExportHandlers, isPanelAnimating = false }) => {
  const chartInstanceRef = useRef(null);
  const fullscreenChartRef = useRef(null);
  const expandBtnRef = useRef(null);
  const exportId = useId();
  const titleId = useId();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const collectCsvRef = useRef(() => null);
  const collectPngRef = useRef(() => null);
  const hasData = graphData && graphData.data_points && graphData.data_points.length > 0;

  const filteredData = useMemo(() => {
    const dataPoints = graphData?.data_points || [];
    if (!dataPoints.length) return [];
    if (!dateRange?.startDate || !dateRange?.endDate) return dataPoints;

    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    return dataPoints.filter(point => {
      const pointDate = new Date(point.date);
      return pointDate >= startDate && pointDate <= endDate;
    });
  }, [graphData?.data_points, dateRange?.startDate, dateRange?.endDate]);

  const optimizedData = useMemo(() => {
    if (filteredData.length <= 1000) return filteredData;
    const step = Math.ceil(filteredData.length / 1000);
    return filteredData.filter((_, index) => index % step === 0);
  }, [filteredData]);

  const handleDownloadCSV = useCallback(() => {
    if (!filteredData.length) return;
    const startDate = formatDateForFilename(dateRange?.startDate || filteredData[0]?.date);
    const endDate = formatDateForFilename(dateRange?.endDate || filteredData[filteredData.length - 1]?.date);
    const filename = `${sanitizeFilename(graphData.station_name)}_discharge_${startDate}_${endDate}.csv`;
    const headers = ['date', 'discharge_m3s'];
    const rows = filteredData.map(p => [p.date, p.discharge]);
    downloadCSV(filename, headers, rows);
  }, [filteredData, graphData?.station_name, dateRange]);

  const handleDownloadPNG = useCallback(() => {
    const ref = chartInstanceRef.current;
    const chart = ref?.chartInstance || ref;
    downloadChartPNG(chart, `${sanitizeFilename(graphData?.station_name)}_discharge.png`);
  }, [graphData?.station_name]);

  const collectCSV = useCallback(() => {
    if (!filteredData.length) return null;
    const startDate = formatDateForFilename(dateRange?.startDate || filteredData[0]?.date);
    const endDate = formatDateForFilename(dateRange?.endDate || filteredData[filteredData.length - 1]?.date);
    const filename = `${sanitizeFilename(graphData?.station_name)}_discharge_${startDate}_${endDate}.csv`;
    return buildCSV(filename, ['date', 'discharge_m3s'], filteredData.map(p => [p.date, p.discharge]));
  }, [filteredData, graphData?.station_name, dateRange]);

  const collectPNG = useCallback(() => {
    const ref = chartInstanceRef.current;
    const chart = ref?.chartInstance || ref;
    return buildChartPNG(chart, `${sanitizeFilename(graphData?.station_name)}_discharge.png`);
  }, [graphData?.station_name]);

  collectCsvRef.current = collectCSV;
  collectPngRef.current = collectPNG;

  useEffect(() => {
    if (!registerExportHandlers) return undefined;
    const unregister = registerExportHandlers({
      id: exportId,
      getCsv: () => (hasData ? [() => collectCsvRef.current()] : []),
      getPng: () => (hasData ? [() => collectPngRef.current()] : []),
    });
    return unregister;
  }, [registerExportHandlers, exportId, hasData]);

  if (!hasData) {
    return (
      <Graph
        type="line"
        title={graphData?.station_name || 'Station Data'}
        subtitle="No data available"
        data={{ labels: [], datasets: [] }}
        className="station-chart"
        isPanelAnimating={isPanelAnimating}
      />
    );
  }

  // Prepare data for Chart.js
  const ORANGE = '#FFA726';
  const chartData = {
    labels: optimizedData.map(point => point.date),
    datasets: [
      {
        label: DISCHARGE_AXIS,
        data: optimizedData.map(point => point.discharge),
        borderColor: ORANGE,
        backgroundColor: 'rgba(255, 167, 38, 0.1)',
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.1,
        fill: true,
        spanGaps: true,
        segment: {
          borderColor: ORANGE,
        }
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
            return `${DISCHARGE_CFG.label}: ${context.parsed.y.toFixed(DISCHARGE_CFG.decimals)} ${DISCHARGE_CFG.unit}`;
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
          display: true,
          text: DISCHARGE_AXIS_LINES,
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

  const chartTitle = subbasinName ? `${graphData.station_name} ${subbasinName}` : graphData.station_name;

  return (
    <div className="station-chart-wrapper">
      <Graph
        type="line"
        title={chartTitle}
        subtitle=""
        data={chartData}
        options={options}
        className="station-chart"
        enableZoom={true}
        onDownloadCSV={handleDownloadCSV}
        onDownloadPNG={handleDownloadPNG}
        chartRefProp={chartInstanceRef}
        isPanelAnimating={isPanelAnimating}
        titleId={titleId}
        onExpand={() => setIsFullscreen(true)}
        expandBtnRef={expandBtnRef}
      />
      <ChartFullscreenModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        titleId={titleId}
        openerRef={expandBtnRef}
      >
        <Graph
          type="line"
          title={chartTitle}
          subtitle=""
          data={chartData}
          options={options}
          className="station-chart"
          enableZoom={true}
          onDownloadCSV={handleDownloadCSV}
          onDownloadPNG={handleDownloadPNG}
          chartRefProp={fullscreenChartRef}
          isPanelAnimating={false}
          isFullscreen
          titleId={titleId}
          onClose={() => setIsFullscreen(false)}
        />
      </ChartFullscreenModal>
    </div>
  );
};

export default StationChart;
