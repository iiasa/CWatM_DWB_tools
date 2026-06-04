// Frontend Configuration Service
const config = {
  // Backend API Configuration
  backend: {
    url: process.env.REACT_APP_BACKEND_URL || '/api',
    apiBaseUrl: process.env.REACT_APP_API_BASE_URL || '/api',
  },

  // Map Configuration
  map: {
    googleSatelliteUrl: process.env.REACT_APP_GOOGLE_SATELLITE_URL || 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    osmTileUrl: process.env.REACT_APP_OSM_TILE_URL || 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    defaultCenter: {
      lon: parseFloat(process.env.REACT_APP_DEFAULT_CENTER_LON) || 22.5,
      lat: parseFloat(process.env.REACT_APP_DEFAULT_CENTER_LAT) || 46.0,
    },
    defaultZoom: parseInt(process.env.REACT_APP_DEFAULT_ZOOM) || 5,
    minZoom: parseInt(process.env.REACT_APP_MIN_ZOOM) || 2,
    maxZoom: parseInt(process.env.REACT_APP_MAX_ZOOM) || 19,
  },

  // Application Configuration
  app: {
    name: process.env.REACT_APP_APP_NAME || 'DWB',
    version: process.env.REACT_APP_VERSION || '1.0.0',
    environment: process.env.REACT_APP_ENVIRONMENT || 'development',
  },

  // TiTiler Configuration (on-the-fly raster tile server)
  titiler: {
    url: process.env.REACT_APP_TITILER_URL || '/tiles',
  },

  // API Endpoints
  api: {
    endpoints: {
      health: '/health',
      data: '/data',
      layers: '/layers',
    }
  }
};

// Validation function
export const validateConfig = () => {
  const errors = [];

  // Check required backend URL
  if (!config.backend.url) {
    errors.push('REACT_APP_BACKEND_URL is required');
  }

  // Check map center coordinates
  if (isNaN(config.map.defaultCenter.lon) || isNaN(config.map.defaultCenter.lat)) {
    errors.push('Invalid map center coordinates');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    return false;
  }

  return true;
};

// Log configuration in development
if (config.app.environment === 'development') {
  console.log('Frontend Configuration:', {
    backend: config.backend,
    map: config.map,
    app: config.app,
  });
}

export default config;
