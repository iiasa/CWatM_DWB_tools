/**
 * Export utilities for downloading chart data as CSV and chart images as PNG.
 * Uses JSZip for bundled "Download All" exports.
 */
import JSZip from 'jszip';

/**
 * Escape a CSV cell value (handle commas, quotes, newlines).
 * @param {*} value - The cell value
 * @returns {string} Escaped CSV cell
 */
const escapeCSVCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Trigger a file download in the browser.
 * @param {Blob} blob - The file content as a Blob
 * @param {string} filename - The download filename
 */
const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Download data as a CSV file.
 * @param {string} filename - The download filename (should end in .csv)
 * @param {string[]} headers - Column header names
 * @param {Array<Array<*>>} rows - Array of row arrays
 */
export const downloadCSV = (filename, headers, rows) => {
  const headerLine = headers.map(escapeCSVCell).join(',');
  const dataLines = rows.map(row => row.map(escapeCSVCell).join(','));
  const csvContent = [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
};

/**
 * Convert a base64 data URL to a Blob.
 * @param {string} dataUrl - The base64 data URL (e.g., "data:image/png;base64,...")
 * @returns {Blob}
 */
const dataUrlToBlob = (dataUrl) => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
};

/**
 * Download a Chart.js chart instance as a PNG image.
 * @param {Object} chartInstance - The Chart.js chart instance
 * @param {string} filename - The download filename (should end in .png)
 */
export const downloadChartPNG = (chartInstance, filename) => {
  if (!chartInstance) return;
  const dataUrl = chartInstance.toBase64Image('image/png', 1);
  const blob = dataUrlToBlob(dataUrl);
  triggerDownload(blob, filename);
};

/**
 * Download a Plotly chart as a PNG image.
 * Uses the global Plotly instance that react-plotly.js loads on the page.
 * @param {HTMLElement} plotElement - The Plotly chart DOM element (the div containing the plot)
 * @param {string} filename - The download filename (should end in .png)
 * @returns {Promise<void>}
 */
export const downloadPlotlyPNG = async (plotElement, filename) => {
  if (!plotElement) return;
  // Access the Plotly instance from the global scope (loaded by react-plotly.js)
  const Plotly = window.Plotly || plotElement._fullLayout?._context?.plotly;
  if (!Plotly || !Plotly.toImage) {
    // Fallback: use the canvas directly if Plotly global is not available
    const canvas = plotElement.querySelector('canvas') || plotElement.querySelector('.main-svg');
    if (canvas && canvas.toDataURL) {
      const dataUrl = canvas.toDataURL('image/png');
      const blob = dataUrlToBlob(dataUrl);
      triggerDownload(blob, filename);
    }
    return;
  }
  const dataUrl = await Plotly.toImage(plotElement, {
    format: 'png',
    width: 1200,
    height: 600,
  });
  const blob = dataUrlToBlob(dataUrl);
  triggerDownload(blob, filename);
};

/**
 * Format an ISO date string to YYYY-MM-DD for use in filenames.
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date string
 */
export const formatDateForFilename = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Sanitize a string for use in filenames.
 * Replaces spaces and special characters with underscores.
 * @param {string} name - The raw string
 * @returns {string} Sanitized filename-safe string
 */
export const sanitizeFilename = (name) => {
  if (!name) return 'unknown';
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

/**
 * Build a CSV blob without triggering download (for zip bundling).
 * @param {string} filename - The intended filename
 * @param {string[]} headers - Column header names
 * @param {Array<Array<*>>} rows - Array of row arrays
 * @returns {{ filename: string, blob: Blob }}
 */
export const buildCSV = (filename, headers, rows) => {
  const headerLine = headers.map(escapeCSVCell).join(',');
  const dataLines = rows.map(row => row.map(escapeCSVCell).join(','));
  const csvContent = [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  return { filename, blob };
};

/**
 * Build a Chart.js PNG blob without triggering download (for zip bundling).
 * @param {Object} chartInstance - The Chart.js chart instance
 * @param {string} filename - The intended filename
 * @returns {{ filename: string, blob: Blob } | null}
 */
export const buildChartPNG = (chartInstance, filename) => {
  if (!chartInstance) return null;
  const dataUrl = chartInstance.toBase64Image('image/png', 1);
  const blob = dataUrlToBlob(dataUrl);
  return { filename, blob };
};

/**
 * Build a Plotly PNG blob without triggering download (for zip bundling).
 * @param {HTMLElement} plotElement - The Plotly chart DOM element
 * @param {string} filename - The intended filename
 * @returns {Promise<{ filename: string, blob: Blob } | null>}
 */
export const buildPlotlyPNG = async (plotElement, filename) => {
  if (!plotElement) return null;
  const Plotly = window.Plotly || plotElement._fullLayout?._context?.plotly;
  if (!Plotly || !Plotly.toImage) {
    const canvas = plotElement.querySelector('canvas') || plotElement.querySelector('.main-svg');
    if (canvas && canvas.toDataURL) {
      const dataUrl = canvas.toDataURL('image/png');
      const blob = dataUrlToBlob(dataUrl);
      return { filename, blob };
    }
    return null;
  }
  const dataUrl = await Plotly.toImage(plotElement, {
    format: 'png',
    width: 1200,
    height: 600,
  });
  const blob = dataUrlToBlob(dataUrl);
  return { filename, blob };
};

/**
 * Bundle multiple files into a ZIP and trigger download.
 * @param {string} zipFilename - The zip file name
 * @param {Array<{ filename: string, blob: Blob }>} files - Files to include
 */
export const downloadAsZip = async (zipFilename, files) => {
  const validFiles = files.filter(Boolean);
  if (validFiles.length === 0) return;

  // If only one file, download directly without zipping
  if (validFiles.length === 1) {
    triggerDownload(validFiles[0].blob, validFiles[0].filename);
    return;
  }

  const zip = new JSZip();
  for (const file of validFiles) {
    zip.file(file.filename, file.blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, zipFilename);
};
