// Web Worker za procesiranje geografskih podataka
self.onmessage = function(e) {
  const { type, data, options } = e.data;

  try {
    switch (type) {
      case 'PROCESS_STATIONS':
        const processedStations = processStationsData(data);
        self.postMessage({
          type: 'STATIONS_PROCESSED',
          data: processedStations
        });
        break;

      case 'PROCESS_SUBBASINS':
        const processedSubbasins = processSubbasinsData(data);
        self.postMessage({
          type: 'SUBBASINS_PROCESSED',
          data: processedSubbasins
        });
        break;

      case 'FILTER_FEATURES_BY_EXTENT':
        const filteredFeatures = filterFeaturesByExtent(data.features, data.extent);
        self.postMessage({
          type: 'FEATURES_FILTERED',
          data: filteredFeatures
        });
        break;

      case 'CLUSTER_FEATURES':
        const clusteredFeatures = clusterFeatures(data.features, data.options);
        self.postMessage({
          type: 'FEATURES_CLUSTERED',
          data: clusteredFeatures
        });
        break;

      default:
        self.postMessage({
          type: 'ERROR',
          error: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error.message
    });
  }
};

function processStationsData(stations) {
  return stations.map(station => {
    const lat = asNumber(station.lat);
    const lon = asNumber(station.lon);
    
    if (lat !== null && lon !== null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      return {
        ...station,
        lat,
        lon,
        isValid: true
      };
    }
    return {
      ...station,
      isValid: false
    };
  }).filter(station => station.isValid);
}

function processSubbasinsData(subbasins) {
  if (subbasins.type === 'FeatureCollection' && subbasins.features) {
    return {
      ...subbasins,
      features: subbasins.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          area: feature.properties.SUB_AREA || 0,
          order: feature.properties.ORDER || 0
        }
      }))
    };
  }
  return subbasins;
}

function filterFeaturesByExtent(features, extent) {
  return features.filter(feature => {
    const geometry = feature.geometry;
    if (!geometry || !geometry.coordinates) return false;
    
    // Simple bounding box check
    const coords = getFeatureCoordinates(geometry);
    return coords.some(coord => 
      coord[0] >= extent[0] && coord[0] <= extent[2] &&
      coord[1] >= extent[1] && coord[1] <= extent[3]
    );
  });
}

function clusterFeatures(features, options = {}) {
  const { distance = 50, minPoints = 2 } = options;
  const clusters = [];
  const processed = new Set();

  features.forEach((feature, index) => {
    if (processed.has(index)) return;

    const cluster = [feature];
    processed.add(index);

    features.forEach((otherFeature, otherIndex) => {
      if (processed.has(otherIndex) || index === otherIndex) return;

      const distance = calculateDistance(feature, otherFeature);
      if (distance <= options.distance) {
        cluster.push(otherFeature);
        processed.add(otherIndex);
      }
    });

    if (cluster.length >= minPoints) {
      clusters.push({
        type: 'cluster',
        features: cluster,
        center: calculateClusterCenter(cluster),
        count: cluster.length
      });
    } else {
      clusters.push(...cluster);
    }
  });

  return clusters;
}

function getFeatureCoordinates(geometry) {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'LineString':
      return geometry.coordinates;
    case 'Polygon':
      return geometry.coordinates[0];
    case 'MultiPoint':
      return geometry.coordinates;
    case 'MultiLineString':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flat().flat();
    default:
      return [];
  }
}

function calculateDistance(feature1, feature2) {
  const coords1 = getFeatureCoordinates(feature1.geometry)[0];
  const coords2 = getFeatureCoordinates(feature2.geometry)[0];
  
  if (!coords1 || !coords2) return Infinity;
  
  const dx = coords1[0] - coords2[0];
  const dy = coords1[1] - coords2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateClusterCenter(features) {
  const coords = features.map(f => getFeatureCoordinates(f.geometry)[0]).filter(Boolean);
  if (coords.length === 0) return [0, 0];
  
  const sumX = coords.reduce((sum, coord) => sum + coord[0], 0);
  const sumY = coords.reduce((sum, coord) => sum + coord[1], 0);
  
  return [sumX / coords.length, sumY / coords.length];
}

function asNumber(v) {
  return (v === null || v === undefined || v === '' ? null : Number(v));
}
