// Central registry of button tooltip text.
//
// Each icon/tool button references a stable KEY via its `data-tooltip`
// attribute (e.g. data-tooltip="baseMap"). The global <ButtonTooltip />
// component resolves that key to the short, human-readable label below.
//
// Translation-ready by design: to localize, replace getTooltipLabel with a
// per-locale lookup (e.g. getTooltipLabel(key, locale)). No button markup has
// to change — only this one file.

export const TOOLTIP_LABELS = {
  // --- Map tools ---
  baseMap: 'Base map',
  layers: 'Layers',
  upstreamShow: 'Show upstream subbasins',
  upstreamHide: 'Hide upstream subbasins',
  legendShow: 'Show legend',
  legendHide: 'Hide legend',
  markerPlace: 'Place marker',
  markerDeactivate: 'Deactivate marker',
  chartsPanelShow: 'Show charts',
  chartsPanelHide: 'Hide charts',
  chartsExpand: 'Expand charts',
  chartsRestore: 'Restore charts',
  zoomExtent: 'Zoom to full extent',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  cancelProcessing: 'Cancel processing',
  closePanel: 'Close',
  clearSearch: 'Clear search',

  // --- Graph / chart tools ---
  fullscreen: 'Full screen',
  downloadCsv: 'Download CSV',
  downloadPng: 'Download PNG',
  resetZoom: 'Reset zoom',
  close: 'Close',

  // --- Date range / time controls ---
  play: 'Play',
  pause: 'Pause',
  stepBack: 'Previous',
  stepForward: 'Next',
  openCalendar: 'Pick date',
};

/**
 * Resolve a tooltip key to its display text.
 * Falls back to the raw key so a missing entry is still readable rather than
 * showing nothing.
 *
 * @param {string} key - the value of an element's `data-tooltip` attribute
 * @returns {string} the label to display
 */
export const getTooltipLabel = (key) => TOOLTIP_LABELS[key] || key;
