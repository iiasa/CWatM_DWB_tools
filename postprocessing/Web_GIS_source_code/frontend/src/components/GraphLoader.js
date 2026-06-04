import React from 'react';
import './GraphLoader.css';

/**
 * Full-screen loader component with rotating circle animation
 * @param {Object} props
 * @param {string} props.message - Loading message to display
 * @param {boolean} props.isVisible - Whether the loader is visible
 */
const GraphLoader = ({ message = "Creating graph", isVisible = true }) => {
  if (!isVisible) return null;

  return (
    <div className="graph-loader-overlay">
      <div className="graph-loader-container">
        <div className="graph-loader-spinner">
          <div className="graph-loader-circle"></div>
        </div>
        <div className="graph-loader-message">
          {message}
        </div>
      </div>
    </div>
  );
};

export default GraphLoader;
