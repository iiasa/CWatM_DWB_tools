import config from '../config/app.config';

class OptimizedApiService {
  constructor() {
    this.baseURL = config.backend.apiBaseUrl;
    this.timeout = 10000;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minuta
    this.requestQueue = new Map();
    this.maxConcurrentRequests = 6;
    this.activeRequests = 0;
  }

  // Cache management
  getCacheKey(endpoint, params = {}) {
    return `${endpoint}_${JSON.stringify(params)}`;
  }

  getCachedData(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(cacheKey);
    return null;
  }

  setCachedData(cacheKey, data) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  // Request queue management
  async queueRequest(endpoint, options = {}) {
    const cacheKey = this.getCacheKey(endpoint, options.params);
    
    // Check cache first
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Check if request is already in progress
    if (this.requestQueue.has(cacheKey)) {
      return this.requestQueue.get(cacheKey);
    }

    // Create new request promise
    const requestPromise = this.executeRequest(endpoint, options);
    this.requestQueue.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      this.setCachedData(cacheKey, result);
      return result;
    } finally {
      this.requestQueue.delete(cacheKey);
    }
  }

  // Execute actual request
  async executeRequest(endpoint, options = {}) {
    // Wait if too many concurrent requests
    while (this.activeRequests >= this.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activeRequests++;
    
    try {
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

      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } finally {
      this.activeRequests--;
    }
  }

  // Generic request method with optimization
  async request(endpoint, options = {}) {
    return this.queueRequest(endpoint, options);
  }

  // Paginated data fetching
  async getPaginatedData(endpoint, options = {}) {
    const {
      page = 1,
      limit = 100,
      batchSize = 50,
      onProgress,
      ...requestOptions
    } = options;

    const totalPages = Math.ceil(limit / batchSize);
    const results = [];
    let currentPage = page;

    for (let i = 0; i < totalPages; i++) {
      const currentLimit = Math.min(batchSize, limit - (i * batchSize));
      const offset = (currentPage - 1) * batchSize;

      try {
        const pageData = await this.request(endpoint, {
          ...requestOptions,
          params: {
            ...requestOptions.params,
            limit: currentLimit,
            offset: offset
          }
        });

        if (Array.isArray(pageData)) {
          results.push(...pageData);
        } else if (pageData.data && Array.isArray(pageData.data)) {
          results.push(...pageData.data);
        }

        // Progress callback
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: totalPages,
            percentage: Math.round(((i + 1) / totalPages) * 100),
            loaded: results.length
          });
        }

        currentPage++;
      } catch (error) {
        console.error(`Error fetching page ${currentPage}:`, error);
        throw error;
      }
    }

    return results;
  }

  // Optimized stations endpoints
  async getCalibStationsOptimized(options = {}) {
    const {
      limit = 1000,
      batchSize = 100,
      onProgress,
      useCache = true
    } = options;

    if (useCache) {
      const cacheKey = this.getCacheKey('/calib-stations', { limit, batchSize });
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const stations = await this.getPaginatedData('/calib-stations', {
      limit,
      batchSize,
      onProgress
    });

    if (useCache) {
      const cacheKey = this.getCacheKey('/calib-stations', { limit, batchSize });
      this.setCachedData(cacheKey, stations);
    }

    return stations;
  }

  // Optimized subbasins endpoints
  async getSubbasinsOptimized(options = {}) {
    const {
      limit = 1000,
      batchSize = 50,
      onProgress,
      useCache = true,
      geomAs = 'geojson'
    } = options;

    if (useCache) {
      const cacheKey = this.getCacheKey('/subbasins/geojson', { limit, batchSize, geomAs });
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // For GeoJSON, we might want to fetch all at once or in smaller batches
    const subbasins = await this.getPaginatedData('/subbasins/geojson', {
      limit,
      batchSize,
      onProgress,
      params: { geomAs }
    });

    if (useCache) {
      const cacheKey = this.getCacheKey('/subbasins/geojson', { limit, batchSize, geomAs });
      this.setCachedData(cacheKey, subbasins);
    }

    return subbasins;
  }

  // Streaming data fetch for large datasets
  async getStreamingData(endpoint, options = {}) {
    const {
      chunkSize = 100,
      onChunk,
      onComplete,
      onError
    } = options;

    let offset = 0;
    let hasMore = true;
    const allData = [];

    try {
      while (hasMore) {
        const chunk = await this.request(endpoint, {
          params: {
            limit: chunkSize,
            offset: offset
          }
        });

        if (!chunk || chunk.length === 0) {
          hasMore = false;
          break;
        }

        allData.push(...chunk);
        offset += chunkSize;

        if (onChunk) {
          onChunk(chunk, offset);
        }

        // Yield control to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (onComplete) {
        onComplete(allData);
      }

      return allData;
    } catch (error) {
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Clear specific cache entry
  clearCacheEntry(endpoint, params = {}) {
    const cacheKey = this.getCacheKey(endpoint, params);
    this.cache.delete(cacheKey);
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.size
    };
  }
}

// Create singleton instance
const optimizedApiService = new OptimizedApiService();

export default optimizedApiService;
