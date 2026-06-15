import config from '../config/app.config';

class ApiService {
  constructor() {
    this.baseURL = config.backend.apiBaseUrl;
    this.timeout = 10000; // 10 seconds
    this._coverageBboxPromise = null;
    // In-flight GET request coalescing. Without this, React.StrictMode's
    // intentional double-mount in dev fires every load-time fetch twice;
    // it also protects production from accidental double-fetches.
    this._inFlight = new Map();
  }

  // Coverage bbox for point-graph queries — memoized so we fetch once per page load.
  // Returns { lat_min, lat_max, lon_min, lon_max } or null if backend is unreachable.
  getCoverageBbox() {
    if (!this._coverageBboxPromise) {
      this._coverageBboxPromise = this.request('/point-graph/coverage').catch((err) => {
        this._coverageBboxPromise = null; // allow retry on next call
        console.warn('Failed to fetch coverage bbox; allowing all clicks:', err.message);
        return null;
      });
    }
    return this._coverageBboxPromise;
  }

  // Generic request method
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: this.timeout,
    };

    const requestOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    };

    // Coalesce duplicate concurrent GETs on the same URL.
    const isGet = (requestOptions.method || 'GET').toUpperCase() === 'GET';
    if (isGet && this._inFlight.has(url)) {
      return this._inFlight.get(url);
    }

    const promise = (async () => {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    })();

    if (isGet) {
      this._inFlight.set(url, promise);
      // Clear the entry as soon as it resolves so the next call goes to the network.
      // (Real caching is handled by HTTP Cache-Control headers + browser cache.)
      promise.finally(() => this._inFlight.delete(url));
    }

    try {
      return await promise;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request was cancelled by user');
        throw new Error('Request cancelled');
      }
      console.error(`API request failed for ${url}:`, error);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    return this.request(config.api.endpoints.health);
  }

  // Data endpoints
  async getData(endpoint = '') {
    return this.request(`${config.api.endpoints.data}${endpoint}`);
  }

  async postData(data, endpoint = '') {
    return this.request(`${config.api.endpoints.data}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Layer endpoints
  async getLayers() {
    return this.request(config.api.endpoints.layers);
  }

  async getLayerById(id) {
    return this.request(`${config.api.endpoints.layers}/${id}`);
  }

  // CalibStations endpoints
  async getCalibStations() {
    return this.request('/calib-stations');
  }

  async getCalibStationById(id) {
    return this.request(`/calib-stations/${id}`);
  }

  async getCalibStationsByCountry(country) {
    return this.request(`/calib-stations/by-country/${encodeURIComponent(country)}`);
  }

  async getCalibStationsByProvider(provider) {
    return this.request(`/calib-stations/by-provider/${encodeURIComponent(provider)}`);
  }

  async getCalibStationsBySubbasin(subbasin) {
    return this.request(`/calib-stations/by-subbasin/${encodeURIComponent(subbasin)}`);
  }

  async getCalibStationsByLocation(lat, lon, radius = 10) {
    return this.request(`/calib-stations/by-location?lat=${lat}&lon=${lon}&radius=${radius}`);
  }

  async getCalibStationsStatistics() {
    return this.request('/calib-stations/statistics');
  }

  async createCalibStation(stationData) {
    return this.request('/calib-stations', {
      method: 'POST',
      body: JSON.stringify(stationData),
    });
  }

  async updateCalibStation(id, stationData) {
    return this.request(`/calib-stations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(stationData),
    });
  }

  async deleteCalibStation(id) {
    return this.request(`/calib-stations/${id}`, {
      method: 'DELETE',
    });
  }

  // Graph endpoints
  async getStationGraph(stationName) {
    return this.request(`/calib-stations/graph/${encodeURIComponent(stationName)}`);
  }

  // Subbasins endpoints
  // Lightweight catalog: id + label fields (Subbasin, ID_2, Country, River,
  // Station, lat, lon) — NO polygon geometry. Use this for the load-time
  // metadata fetch; the actual polygons stream in via the MVT tile layer.
  // Replaces the much heavier getSubbasins() / /subbasins/geojson call.
  async getSubbasinsCatalog() {
    return this.request('/subbasins/catalog');
  }

  async getSubbasins(limit, offset) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    const queryString = params.toString();
    return this.request(`/subbasins/geojson${queryString ? '?' + queryString : ''}`);
  }

  async getSubbasinsRaw(limit, offset, geomAs = 'geojson') {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    if (geomAs) params.append('geomAs', geomAs);
    const queryString = params.toString();
    return this.request(`/subbasins${queryString ? '?' + queryString : ''}`);
  }

  async getSubbasinParquetData(subbasinId) {
    return this.request(`/subbasins/parquet/${subbasinId}`);
  }

  async getSubbasinGraph(subbasinId) {
    return this.request(`/subbasins/graph/${subbasinId}`);
  }

  async getUpstreamSubbasins(subbasinId) {
    return this.request(`/subbasins/${subbasinId}/upstream`);
  }

  // Point graph data endpoints with SSE progress
  async getPointData(lat, lon, options = {}) {
    const {
      onProgress = null,
      onPartial = null,
      signal = null,
    } = options;
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}/point-graph/data?lat=${lat}&lon=${lon}`;
      
      // Use EventSource for SSE
      const eventSource = new EventSource(url);
      
      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          eventSource.close();
          reject(new Error('Request cancelled'));
        });
      }
      
      // Handle progress events
      eventSource.addEventListener('progress', (event) => {
        try {
          const progressData = JSON.parse(event.data);
          if (onProgress) {
            onProgress(progressData);
          }
        } catch (error) {
          console.error('Failed to parse progress data:', error);
        }
      });
      
      // Handle partial dataset updates
      eventSource.addEventListener('partial', (event) => {
        if (!onPartial) return;
        try {
          const partialData = JSON.parse(event.data);
          onPartial(partialData);
        } catch (error) {
          console.error('Failed to parse partial dataset:', error);
        }
      });
      
      // Handle completion
      eventSource.addEventListener('complete', (event) => {
        try {
          const data = JSON.parse(event.data);
          eventSource.close();
          resolve(data);
        } catch (error) {
          eventSource.close();
          reject(new Error('Failed to parse response data'));
        }
      });
      
      // Handle errors
      eventSource.addEventListener('error', (event) => {
        try {
          if (event.data) {
            const errorData = JSON.parse(event.data);
            eventSource.close();
            const err = new Error(errorData.message || errorData.error || 'Unknown error');
            // Preserve structured fields (code, coverage, lat, lon) for callers
            // that want to surface bbox-aware messages.
            err.code = errorData.code;
            err.coverage = errorData.coverage;
            err.lat = errorData.lat;
            err.lon = errorData.lon;
            reject(err);
          } else {
            // Connection error
            eventSource.close();
            reject(new Error('Connection error'));
          }
        } catch (error) {
          eventSource.close();
          reject(new Error('Failed to process error'));
        }
      });
      
      // Generic error handler
      eventSource.onerror = (error) => {
        // Only close if not already handling an error event
        if (eventSource.readyState === EventSource.CLOSED) {
          return;
        }
        eventSource.close();
        reject(new Error('Connection failed'));
      };
    });
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;
