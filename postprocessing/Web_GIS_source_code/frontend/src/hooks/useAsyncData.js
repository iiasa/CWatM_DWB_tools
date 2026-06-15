import { useCallback, useEffect, useRef, useState } from 'react';

// Hook za asinhrono učitavanje podataka sa optimizacijama
export const useAsyncData = (fetchFunction, options = {}) => {
  const {
    initialData = null,
    immediate = true,
    retryCount = 3,
    retryDelay = 1000,
    cacheTime = 5 * 60 * 1000, // 5 minuta
    staleTime = 2 * 60 * 1000, // 2 minuta
    onSuccess,
    onError
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  
  const abortControllerRef = useRef(null);
  const cacheRef = useRef(new Map());
  const retryTimeoutRef = useRef(null);

  // Cache management
  const getCacheKey = useCallback((...args) => {
    return JSON.stringify(args);
  }, []);

  const getCachedData = useCallback((cacheKey) => {
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTime) {
      return cached.data;
    }
    return null;
  }, [cacheTime]);

  const setCachedData = useCallback((cacheKey, data) => {
    cacheRef.current.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }, []);

  // Retry logic
  const retry = useCallback(async (fetchFn, args, attempt = 1) => {
    try {
      const result = await fetchFn(...args);
      setData(result);
      setError(null);
      setLastFetch(Date.now());
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (err) {
      if (attempt < retryCount) {
        retryTimeoutRef.current = setTimeout(() => {
          retry(fetchFn, args, attempt + 1);
        }, retryDelay * attempt);
      } else {
        setError(err);
        if (onError) {
          onError(err);
        }
        throw err;
      }
    }
  }, [retryCount, retryDelay, onSuccess, onError]);

  // Main fetch function
  const fetch = useCallback(async (...args) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Check cache first
    const cacheKey = getCacheKey(...args);
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData && Date.now() - lastFetch < staleTime) {
      setData(cachedData);
      return cachedData;
    }

    setLoading(true);
    setError(null);

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      const result = await retry(fetchFunction, args);
      setCachedData(cacheKey, result);
      return result;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Fetch error:', err);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchFunction, retry, getCacheKey, getCachedData, setCachedData, lastFetch, staleTime]);

  // Auto-fetch on mount
  useEffect(() => {
    if (immediate) {
      fetch();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [immediate, fetch]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    fetch,
    refetch: fetch,
    lastFetch
  };
};
