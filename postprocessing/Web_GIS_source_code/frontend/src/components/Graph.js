import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import './Graph.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  zoomPlugin
);

/**
 * Generic Graph component for displaying charts
 * @param {Object} props
 * @param {string} props.type - Chart type: 'line' or 'bar'
 * @param {Object} props.data - Chart.js data object
 * @param {Object} props.options - Chart.js options object
 * @param {string} props.title - Chart title
 * @param {string} props.subtitle - Chart subtitle/description
 * @param {Function} props.onClose - Close callback
 * @param {string} props.className - Additional CSS class
 * @param {boolean} props.enableZoom - Enable zoom and pan functionality
 */
const Graph = ({
  type = 'line',
  data,
  options,
  title,
  subtitle,
  onClose,
  className = '',
  enableZoom = true,
  onDownloadCSV,
  onDownloadPNG,
  chartRefProp,
  isPanelAnimating = false,
  onExpand,
  isFullscreen = false,
  titleId,
  expandBtnRef,
}) => {
  const chartRef = useRef(null);
  const resetTimeoutRef = useRef(null);
  const [chartInstance, setChartInstance] = useState(null);
  const wasAnimatingRef = useRef(false);

  // Callback ref to capture chart instance and forward to parent
  const chartRefCallback = useCallback((node) => {
    chartRef.current = node;
    if (node && node.chartInstance) {
      setChartInstance(node.chartInstance);
    }
    if (chartRefProp) {
      chartRefProp.current = node;
    }
  }, [chartRefProp]);

  // Debounced reset function
  const debouncedReset = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      // Try multiple ways to get the chart instance
      let chart = chartInstance;
      
      // Method 1: Use stored chart instance
      if (!chart) {
        // Method 2: Try to get from ref
        if (chartRef.current && chartRef.current.chartInstance) {
          chart = chartRef.current.chartInstance;
        }
      }
      
      // Method 3: Try to get from Chart.js registry
      if (!chart) {
        const chartId = chartRef.current?.canvas?.id;
        if (chartId) {
          chart = ChartJS.getChart(chartId);
        }
      }
      
      // Method 4: Try to get the first chart from registry
      if (!chart) {
        const charts = ChartJS.instances;
        if (charts && charts.length > 0) {
          chart = charts[charts.length - 1]; // Get the most recent chart
        }
      }
      
      // Reset zoom if chart is found
      if (chart && typeof chart.resetZoom === 'function') {
        chart.resetZoom();
      } else {
        console.warn('Chart instance not found for reset');
      }
    }, 100);
  }, [chartInstance]);

  // Effect to capture chart instance when it's created
  useEffect(() => {
    const checkForChart = () => {
      if (chartRef.current && chartRef.current.chartInstance && !chartInstance) {
        setChartInstance(chartRef.current.chartInstance);
      }
    };

    // Check immediately
    checkForChart();

    // Also check after a short delay to ensure chart is fully initialized
    const timeout = setTimeout(checkForChart, 100);

    return () => clearTimeout(timeout);
  }, [data, chartInstance]);

  // While the charts-panel CSS transition is in flight, Chart.js's
  // ResizeObserver fires on every frame and synchronously recomputes/redraws
  // the canvas — main contributor to line-chart jank during expand/collapse.
  // Disabling responsive for the ~240 ms transition uninstalls the observer;
  // a single chart.resize() on the falling edge below restores the correct
  // pixel size.
  useEffect(() => {
    if (wasAnimatingRef.current && !isPanelAnimating) {
      const ref = chartRef.current;
      const chart = ref?.chartInstance || ref;
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    }
    wasAnimatingRef.current = isPanelAnimating;
  }, [isPanelAnimating]);

  // When mounted inside the fullscreen modal, the canvas starts at the
  // smaller side-panel size before CSS lays it out at modal scale. One
  // explicit resize() on the next frame syncs Chart.js to the new container.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const frame = requestAnimationFrame(() => {
      const ref = chartRef.current;
      const chart = ref?.chartInstance || ref;
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  // Render appropriate chart type
  const renderChart = () => {
    const defaultOptions = {
      responsive: !isPanelAnimating,
      // Canvas fills its parent's height; the height is controlled by
      // .graph-body in Graph.css (with per-breakpoint overrides).
      maintainAspectRatio: false,
      ...options
    };

    if (enableZoom) {
      defaultOptions.plugins = {
        ...defaultOptions.plugins,
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy', // Allow panning in both directions
            modifierKey: 'ctrl', // Require Ctrl key to pan
          },
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1, // Slower zoom for better control
              modifierKey: 'ctrl', // Require Ctrl key to zoom
            },
            pinch: {
              enabled: true
            },
            mode: 'xy', // Allow zooming in both directions
          },
        },
        legend: {
          ...defaultOptions.plugins?.legend,
          onClick: (e, legendItem, legend) => {
            // Disable default legend click behavior when zoom is enabled
            return;
          }
        }
      };
    }

    // Performance optimizations
    defaultOptions.animation = {
      duration: 0, // Disable animations for better performance
    };
    
    defaultOptions.elements = {
      ...defaultOptions.elements,
      point: {
        radius: 0, // Hide points by default for better performance
        hoverRadius: 3, // Show points only on hover
      },
      line: {
        borderWidth: 1, // Thinner lines for better performance
      }
    };

    // Optimize interaction
    defaultOptions.interaction = {
      ...defaultOptions.interaction,
      intersect: false,
      mode: 'index',
    };

    // Optimize scales
    if (defaultOptions.scales) {
      Object.keys(defaultOptions.scales).forEach(scaleKey => {
        if (defaultOptions.scales[scaleKey]) {
          defaultOptions.scales[scaleKey].ticks = {
            ...defaultOptions.scales[scaleKey].ticks,
            maxTicksLimit: 10, // Limit number of ticks for better performance
          };
        }
      });
    }

    // Fullscreen overrides: bigger labels and more ticks, since we have room.
    if (isFullscreen && defaultOptions.scales) {
      Object.keys(defaultOptions.scales).forEach((scaleKey) => {
        const scale = defaultOptions.scales[scaleKey];
        if (!scale) return;
        scale.ticks = {
          ...(scale.ticks || {}),
          maxTicksLimit: 14,
          font: { ...(scale.ticks?.font || {}), size: 12 },
        };
        if (scale.title) {
          scale.title = {
            ...scale.title,
            font: { ...(scale.title.font || {}), size: 13 },
          };
        }
      });
      defaultOptions.plugins = {
        ...defaultOptions.plugins,
        legend: {
          ...(defaultOptions.plugins?.legend || {}),
          labels: {
            ...(defaultOptions.plugins?.legend?.labels || {}),
            font: { ...(defaultOptions.plugins?.legend?.labels?.font || {}), size: 13 },
          },
        },
      };
    }

    // Generate unique ID for this chart
    const chartId = `chart-${Math.random().toString(36).substr(2, 9)}`;

    switch (type.toLowerCase()) {
      case 'bar':
        return <Bar 
          ref={chartRefCallback} 
          data={data} 
          options={defaultOptions}
          id={chartId}
        />;
      case 'line':
      default:
        return <Line 
          ref={chartRefCallback} 
          data={data} 
          options={defaultOptions}
          id={chartId}
        />;
    }
  };


  // Export buttons rendered in the graph header
  const renderExportButtons = () => {
    if (!onDownloadCSV && !onDownloadPNG) return null;
    return (
      <div className="graph-export-buttons">
        {onDownloadCSV && (
          <button className="graph-export-btn" onClick={onDownloadCSV} data-tooltip="downloadCsv" aria-label="Download CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="graph-export-btn-label">CSV</span>
          </button>
        )}
        {onDownloadPNG && (
          <button className="graph-export-btn" onClick={onDownloadPNG} data-tooltip="downloadPng" aria-label="Download PNG">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="graph-export-btn-label">PNG</span>
          </button>
        )}
      </div>
    );
  };

  const renderFullscreenButton = () => {
    if (!onExpand || isFullscreen) return null;
    return (
      <button
        ref={expandBtnRef}
        type="button"
        className="graph-fullscreen-btn"
        onClick={onExpand}
        aria-label="Open chart in fullscreen"
        data-tooltip="fullscreen"
      >
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 3H3v7h2V5h5zM10 19H5v-5H3v7h7zM21 14h-2v5h-5v2h7zM21 3h-7v2h5v5h2z"/>
        </svg>
      </button>
    );
  };

  const overlayClassName = `graph-overlay ${isFullscreen ? 'graph-overlay--fullscreen' : ''} ${className}`.trim();

  // Handle no data case
  if (!data || !data.datasets || data.datasets.length === 0) {
    return (
      <div className={overlayClassName}>
        <div className="graph-container">
          <div className="graph-header">
            <div className="graph-info">
              <h3 id={titleId}>{title || 'No Data'}</h3>
              {subtitle && <span className="graph-subtitle">{subtitle}</span>}
            </div>
            {renderFullscreenButton()}
            {onClose && (
              <button
                className="graph-close-btn"
                onClick={onClose}
                aria-label={isFullscreen ? 'Close fullscreen chart' : 'Close'}
                data-tooltip="close"
              >
                ×
              </button>
            )}
          </div>
          <div className="graph-body">
            <div className="graph-no-data">
              <p>No data available to display</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayClassName}>
      <div className="graph-container">
        <div className="graph-header">
          <div className="graph-info">
            {title && <h3 id={titleId}>{title}</h3>}
            {subtitle && <span className="graph-subtitle">{subtitle}</span>}
          </div>
          {renderExportButtons()}
          {renderFullscreenButton()}
          {onClose && (
            <button className="graph-close-btn" onClick={onClose} data-tooltip="close" aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="graph-body">
          {enableZoom && (
            <button
              className="graph-reset-btn"
              onClick={debouncedReset}
              data-tooltip="resetZoom"
              aria-label="Reset zoom"
            >
              Reset
            </button>
          )}
          {renderChart()}
          {enableZoom && (
            <div className="graph-instructions" aria-hidden="true">
              <span className="graph-instruction-text">
                Ctrl + Scroll to zoom • Ctrl + Drag to pan
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Graph;
