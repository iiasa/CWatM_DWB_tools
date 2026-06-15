import React, { useMemo, useRef, useCallback, useEffect, useId } from 'react';
import Plot from 'react-plotly.js';
import { downloadPlotlyPNG, buildPlotlyPNG } from '../utils/exportUtils';
import { getDisplayConfig } from '../config/layerLegendConfig';
import {
  PIE_HOVER_DECIMALS,
  LABEL_TO_CONFIG_KEY,
  PALETTE,
  shade,
  pickDataset,
  buildSeries,
  alignOnCommonMonths,
  computeTopShares,
  scaleChildren,
} from './WaterBalancePieChart.helpers';
import './WaterBalancePieChart.css';

// Stable, never-changing references for the Plot. react-plotly.js compares
// `config` (and we keep `style` stable too) by reference and skips
// Plotly.react() when nothing changed — preserving the sunburst's drilled-in
// level across incidental re-renders. New objects every render would always
// look "changed" and reset the drill to root.
const PLOT_CONFIG = { displayModeBar: false, displaylogo: false, responsive: true };
const PLOT_STYLE = { width: '100%', height: '100%' };

const WaterBalancePieChart = ({
  graphData,
  dateRange,
  visualBalance = 'actual',
  alpha = 0.5,
  minChildShare = 0.03,
  aggregate = 'sum',
  unitLabelOverride,
  alignMode = 'intersect',
  registerExportHandlers,
  isPanelAnimating = false,
  subbasinName,
  onExpand,
  isFullscreen = false,
  titleId,
  expandBtnRef,
  onClose,
}) => {
  const plotContainerRef = useRef(null);
  const exportId = useId();
  const collectPngRef = useRef(() => null);
  const wasAnimatingRef = useRef(false);

  // When the panel finishes its width/height transition, the gated
  // ResizeObserver (useResizeHandler={!isPanelAnimating}) has just been
  // re-armed but won't fire on its own since the box is already at its final
  // size. Run one explicit Plotly.Plots.resize() so the sunburst lays itself
  // out at the new size — collapses ~14 per-frame resizes into a single one.
  useEffect(() => {
    if (wasAnimatingRef.current && !isPanelAnimating) {
      const plotEl = plotContainerRef.current?.querySelector('.js-plotly-plot');
      if (plotEl) {
        const Plotly = window.Plotly || plotEl._fullLayout?._context?.plotly;
        if (Plotly && typeof Plotly.Plots?.resize === 'function') {
          Plotly.Plots.resize(plotEl);
        }
      }
    }
    wasAnimatingRef.current = isPanelAnimating;
  }, [isPanelAnimating]);

  // Inside the fullscreen modal the container is much larger than the
  // side-panel mount size — explicitly resize Plotly once the new layout
  // settles so the sunburst recenters instead of staying in the corner.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const frame = requestAnimationFrame(() => {
      const plotEl = plotContainerRef.current?.querySelector('.js-plotly-plot');
      if (!plotEl) return;
      const Plotly = window.Plotly || plotEl._fullLayout?._context?.plotly;
      if (Plotly && typeof Plotly.Plots?.resize === 'function') {
        Plotly.Plots.resize(plotEl);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  const handleDownloadPNG = useCallback(() => {
    const plotEl = plotContainerRef.current?.querySelector('.js-plotly-plot');
    if (plotEl) {
      const hybas = graphData?.hybas_id || 'subbasin';
      downloadPlotlyPNG(plotEl, `water_balance_${hybas}.png`);
    }
  }, [graphData?.hybas_id]);

  const collectPNG = useCallback(() => {
    const plotEl = plotContainerRef.current?.querySelector('.js-plotly-plot');
    if (plotEl) {
      const hybas = graphData?.hybas_id || 'subbasin';
      return buildPlotlyPNG(plotEl, `water_balance_${hybas}.png`);
    }
    return null;
  }, [graphData?.hybas_id]);

  collectPngRef.current = collectPNG;

  useEffect(() => {
    if (!registerExportHandlers) return undefined;
    const unregister = registerExportHandlers({
      id: exportId,
      getCsv: () => [],
      getPng: () => [() => collectPngRef.current()],
    });
    return unregister;
  }, [registerExportHandlers, exportId]);
  const processed = useMemo(() => {
    if (!graphData?.datasets?.length) return null;

    // Basin water-balance semantics for this chart (matches the reference
    // notebook functions/functions_Watercycles.ipynb):
    //   Inputs  = precipitation entering the surface system (Rain, Snow).
    //             Snow Melt and Ice Melt are internal transfers — the same
    //             water is already counted in Snow precipitation — so they
    //             are excluded to avoid double-counting.
    //   Outputs = water leaving the surface system in the same mm/month unit
    //             (Evapotranspiration to atmosphere, Runoff to streamflow).
    //   Discharge (m³/s) and ΔTWS (state variable) are excluded so every node
    //   shares the same mm/month scale and Inputs/Outputs reconcile to 100 %.
    //
    // KNOWN DATA-QUALITY ISSUE (see docs/DATA_QUALITY.md):
    //   The source NetCDFs in data/nc/month/ carry the attribute
    //   `aggregation: 'monthly median'` and were derived from daily files at
    //   C:\Users\nikol\…\merge\output\danube_<var>_daily.nc by taking the
    //   median of daily values per month. Median collapses intermittent
    //   fluxes (Rain rains ~5 days/month → median ≈ 0) while preserving
    //   continuous fluxes (ET runs every day → median ≈ daily mean), so the
    //   Inputs/Outputs ratio is biased by a factor of ~4. The chart still
    //   renders so the layout and aggregation logic can be reviewed, and a
    //   banner above warns the user. Permanent fix is to re-aggregate the
    //   daily NetCDFs with mean (or sum) and regenerate data/subbasins/*.parquet.
    const ds = graphData.datasets;

    const rainDS   = pickDataset(ds, 'danube_Rain_');
    const snowDS   = pickDataset(ds, 'danube_Snow_');
    const etDS     = pickDataset(ds, 'danube_totalET_WB_');
    const runoffDS = pickDataset(ds, 'danube_runoff_');

    const rainS   = buildSeries(rainDS,   dateRange);
    const snowS   = buildSeries(snowDS,   dateRange);
    const etS     = buildSeries(etDS,     dateRange);
    const runoffS = buildSeries(runoffDS, dateRange);

    const { keys, aligned } = alignOnCommonMonths(
      [rainS, snowS, etS, runoffS],
      alignMode
    );
    const [rainA, snowA, etA, runoffA] = aligned;

    const numMonths = keys.length;
    const sumVals = (arr) => arr.reduce((s, p) => s + p.v, 0);

    // Inputs to the pie are already in mm/month (factor applied in
    // buildSeries). Summing N monthly values yields total depth over the
    // selected period (mm); averaging yields the mean monthly depth
    // (mm/month). The "mm/day" mode that previously divided by total days
    // was inconsistent with how every other chart treats monthly data.
    const toAgg = (arr) => {
      if (!arr.length) return 0;
      if (aggregate === 'avg') return numMonths ? sumVals(arr) / numMonths : 0;
      return sumVals(arr);
    };

    const inputsAgg = [
      rainA.length ? { label: 'Rain', value: toAgg(rainA) } : null,
      snowA.length ? { label: 'Snow', value: toAgg(snowA) } : null
    ].filter(Boolean).filter(x => x.value > 0);

    const outputsAgg = [
      etA.length     ? { label: 'Evapotranspiration', value: toAgg(etA) }     : null,
      runoffA.length ? { label: 'Runoff',             value: toAgg(runoffA) } : null
    ].filter(Boolean).filter(x => x.value > 0);

    const totals = {
      inputs: inputsAgg.reduce((s, x) => s + x.value, 0),
      outputs: outputsAgg.reduce((s, x) => s + x.value, 0)
    };
    totals.total = totals.inputs + totals.outputs;

    return { inputsAgg, outputsAgg, totals };
  }, [graphData, dateRange, aggregate, alignMode]);

  // Build the Plotly figure once per data change. Keeping plotData/plotLayout
  // referentially stable across unrelated re-renders (e.g. the isPanelAnimating
  // flip, hover state, fresh inline onExpand/onClose props) is what lets
  // react-plotly.js skip Plotly.react() and preserve the user's drilled-in
  // sunburst level until they click the center. This hook must run before any
  // early return to satisfy the Rules of Hooks, so the empty case returns null
  // here and drives the early return below.
  const figure = useMemo(() => {
    if (!processed || processed.totals.total <= 0) return null;

    const { totals, inputsAgg, outputsAgg } = processed;

    const topShares = computeTopShares(
      { Inputs: totals.inputs, Outputs: totals.outputs },
      visualBalance, alpha
    );
    const sInputs = topShares.Inputs || 0;
    const sOutputs = topShares.Outputs || 0;

    const grandViz = 1000;
    const inputsScaled = scaleChildren(inputsAgg, sInputs, minChildShare);
    const outputsScaled = scaleChildren(outputsAgg, sOutputs, minChildShare);

    // Sum mode → mm (depth accumulated over period); avg mode → mm/month
    // (mean of the monthly values). All flux leaves are already mm/month so the
    // aggregate-derived unit also matches the parent Inputs / Outputs nodes.
    const aggregateUnit = unitLabelOverride || (aggregate === 'avg' ? 'mm/month' : 'mm');
    const unitFor = (label) =>
      getDisplayConfig(LABEL_TO_CONFIG_KEY[label])?.unit ?? aggregateUnit;

    const labels = [];
    const parents = [];
    const values = [];
    const colors = [];
    const realVals = [];
    const pctBasin = [];
    const nodeUnit = [];

    const add = (l, p, v, c, rv, rp) => {
      labels.push(l); parents.push(p); values.push(v);
      colors.push(c); realVals.push(rv); pctBasin.push(rp);
      nodeUnit.push(unitFor(l));
    };

    add('Basin', '', grandViz, PALETTE.basin, totals.total, 100);

    if (totals.inputs > 0 && sInputs > 0) {
      add('Inputs', 'Basin', grandViz * sInputs, shade(PALETTE.inputs, 0.0, false),
        totals.inputs, (totals.inputs / totals.total) * 100);
      for (const ch of inputsScaled) {
        add(ch.label, 'Inputs', ch.viz * grandViz, shade(PALETTE.inputs, 0.25, true),
          ch.value, (ch.value / totals.total) * 100);
      }
    }

    if (totals.outputs > 0 && sOutputs > 0) {
      add('Outputs', 'Basin', grandViz * sOutputs, shade(PALETTE.outputs, 0.0, false),
        totals.outputs, (totals.outputs / totals.total) * 100);
      for (const ch of outputsScaled) {
        add(ch.label, 'Outputs', ch.viz * grandViz,
          shade(PALETTE.outputs, 0.25, true),
          ch.value, (ch.value / totals.total) * 100);
      }
    }

    const plotData = [{
      type: 'sunburst',
      labels,
      parents,
      values,
      branchvalues: 'total',
      marker: { colors, line: { width: 2, color: '#FFFFFF' } },
      textinfo: 'label',
      hovertemplate:
        '<b>%{label}</b><br>' +
        `Value: %{customdata[0]:,.${PIE_HOVER_DECIMALS}f} %{customdata[2]}<br>` +
        'Percent of basin: %{customdata[1]:.1f}%<br>' +
        '<extra></extra>',
      customdata: labels.map((_, i) => [realVals[i] || 0, pctBasin[i] || 0, nodeUnit[i] || '']),
      maxdepth: 3,
      insidetextorientation: 'radial',
      sort: false
    }];

    const plotLayout = {
      margin: { l: 20, r: 20, t: 20, b: 20 },
      paper_bgcolor: '#FFFFFF',
      plot_bgcolor: '#FFFFFF',
      showlegend: false,
      autosize: true,
      // Persist the user's drilled-in sunburst level (a GUI-edit) across redraws.
      // Without uirevision, any relayout/resize/react — notably the
      // Plotly.Plots.resize() fired when the panel animation settles — reverts
      // trace.level back to root (''), snapping the chart out of the clicked
      // slice ~a second after the click. Keying it to the subbasin id preserves
      // the drill across resizes and date-range tweaks, but resets to the full
      // view when a different subbasin is selected (expected for new data).
      uirevision: graphData?.hybas_id ?? 'water-balance'
    };

    return { plotData, plotLayout };
  }, [processed, visualBalance, alpha, minChildShare, aggregate, unitLabelOverride, graphData?.hybas_id]);

  if (!figure) {
    return (
      <div className="water-pie-empty">
        <div className="water-pie-empty-title">No data for this range</div>
        <div className="water-pie-empty-sub">
          No overlapping months across the required water-balance datasets.
        </div>
      </div>
    );
  }

  const { plotData, plotLayout } = figure;

  const headerTitle = `Subbasin ${subbasinName || graphData?.hybas_id || ''} - Water Balance`.replace(/\s+/g, ' ').trim();

  return (
    <div
      ref={plotContainerRef}
      className={`pie-chart-overlay ${isFullscreen ? 'pie-chart-overlay--fullscreen' : ''}`.trim()}
    >
      <div className="pie-chart-header">
        <div className="pie-chart-info">
          <h3 id={titleId}>{headerTitle}</h3>
        </div>
        <div className="pie-chart-actions">
          <button
            className="graph-export-btn"
            onClick={handleDownloadPNG}
            data-tooltip="downloadPng"
            aria-label="Download PNG"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="graph-export-btn-label">PNG</span>
          </button>
          {onExpand && !isFullscreen && (
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
          )}
          {onClose && (
            <button
              type="button"
              className="graph-close-btn"
              onClick={onClose}
              aria-label={isFullscreen ? 'Close fullscreen chart' : 'Close'}
              data-tooltip="close"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="pie-chart-body">
        <Plot
          data={plotData}
          layout={plotLayout}
          config={PLOT_CONFIG}
          style={PLOT_STYLE}
          useResizeHandler={!isPanelAnimating}
        />
      </div>
    </div>
  );
};

export default WaterBalancePieChart;
