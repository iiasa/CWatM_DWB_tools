import React from 'react';
import LEGEND_ITEMS_CONFIG from '../config/layerLegendConfig';
import './Legend.css';

/**
 * Legend - Displays color-range legends for visible raster layers.
 * Rendered as a flow child inside .map-top-right-stack, so positioning,
 * spacing, and overflow are handled by the wrapper.
 * @param {Object} props
 * @param {Object} props.layerVisibility - Visibility state for each layer
 */
const Legend = ({ layerVisibility }) => {
  const legendItems = LEGEND_ITEMS_CONFIG.map((cfg) => ({
    ...cfg,
    visible: layerVisibility?.[cfg.stateKey] || false,
    // Raster layers carry bucketed value ranges; vector layers (rivers/lakes) do not.
    isRanged: Array.isArray(cfg.ranges) && cfg.ranges.length > 0,
    // Categorical layers (LULC) carry a list of discrete class swatches instead.
    isCategorical: Array.isArray(cfg.categories) && cfg.categories.length > 0,
  }));

  const visibleLayers = legendItems.filter((item) => item.visible);

  if (visibleLayers.length === 0) return null;

  const groupedLayers = visibleLayers.reduce((groups, layer) => {
    const category = layer.category;
    if (!groups[category]) groups[category] = [];
    groups[category].push(layer);
    return groups;
  }, {});

  const formatValue = (value) => {
    if (Number.isInteger(value)) return value.toString();
    return parseFloat(value.toPrecision(3)).toString();
  };

  const renderRangedLegend = (item) => (
    <div key={item.id} className="legend-ranged-item">
      <div className="legend-item-content">
        <span className="legend-item-name">{item.name}</span>
        <span className="legend-item-unit">({item.unit})</span>
      </div>
      <div className="legend-ranges-container">
        {item.ranges.map((range, index) => (
          <div key={index} className="legend-range-item">
            <div
              className="legend-range-color-box"
              style={{ backgroundColor: range.color }}
            />
            <span className="legend-range-text">
              {range.to !== null
                ? `${formatValue(range.from)} – ${formatValue(range.to)}`
                : `${formatValue(range.from)}+`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  // Categorical legend (LULC): a scrollable list of discrete class swatches
  // with their names — no value-range bar, since the layer is not continuous.
  const renderCategoricalLegend = (item) => (
    <div key={item.id} className="legend-categorical-item">
      <div className="legend-item-content">
        <span className="legend-item-name">{item.name}</span>
        <span className="legend-item-unit">({item.unit})</span>
      </div>
      <div className="legend-categories-container">
        {item.categories.map((cat) => (
          <div key={cat.code} className="legend-category-item">
            <div
              className="legend-category-color-box"
              style={{ backgroundColor: cat.color }}
            />
            <span className="legend-category-label">{cat.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLegendItem = (item) => {
    if (item.isRanged) return renderRangedLegend(item);
    if (item.isCategorical) return renderCategoricalLegend(item);

    // Line sample for the river network (thin → thick = stream order).
    const sample =
      item.type === 'line' ? (
        <div className="legend-line-sample" aria-hidden="true">
          <span style={{ height: '2px', backgroundColor: item.color }} />
          <span style={{ height: '4px', backgroundColor: item.color }} />
          <span style={{ height: '6px', backgroundColor: item.color }} />
        </div>
      ) : (
        <div className="legend-color-box" style={{ backgroundColor: item.color }} />
      );

    return (
      <div key={item.id} className="legend-item">
        {sample}
        <div className="legend-item-content">
          <span className="legend-item-name">{item.name}</span>
          <span className="legend-item-unit">({item.unit})</span>
          {item.note && <span className="legend-item-note">{item.note}</span>}
        </div>
      </div>
    );
  };

  const CATEGORY_TITLES = { inputs: 'Inputs', outputs: 'Outputs', terrain: 'Terrain', water: 'Surface water', land: 'Land cover' };

  const renderLegendGroup = (categoryName, items) => (
    <div key={categoryName} className="legend-group">
      <div className="legend-group-header">
        <h4 className="legend-group-title">
          {CATEGORY_TITLES[categoryName] || 'Outputs'}
        </h4>
      </div>
      <div className="legend-group-items">
        {items.map(renderLegendItem)}
      </div>
    </div>
  );

  return (
    <div className="legend-container" data-hover-ignore>
      <div className="legend-header">
        <div className="legend-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </div>
        <h3 className="legend-title">Layer Legend</h3>
      </div>

      <div className="legend-content">
        {Object.entries(groupedLayers).map(([category, items]) =>
          renderLegendGroup(category, items)
        )}
      </div>

      <div className="legend-footer">
        <span className="legend-footer-text">
          {visibleLayers.length} layer{visibleLayers.length !== 1 ? 's' : ''} visible
        </span>
      </div>
    </div>
  );
};

export default Legend;
