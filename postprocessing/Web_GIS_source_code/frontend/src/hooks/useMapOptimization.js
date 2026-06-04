import { useCallback, useMemo, useRef } from 'react';

// Hook za optimizaciju mape
export const useMapOptimization = () => {
  const debounceTimeoutRef = useRef(null);
  const lastViewStateRef = useRef(null);

  // Debounced view change handler
  const debouncedViewChange = useCallback((callback, delay = 300) => {
    return (...args) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      debounceTimeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    };
  }, []);

  // Memoized style functions
  const createStationStyle = useCallback(() => {
    return new Style({
      image: new Circle({
        radius: 8,
        fill: new Fill({ color: '#0066cc' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      })
    });
  }, []);

  const createSelectedStationStyle = useCallback(() => {
    return new Style({
      image: new Circle({
        radius: 10,
        fill: new Fill({ color: '#ffd700' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 })
      })
    });
  }, []);

  const createSubbasinStyle = useCallback(() => {
    return new Style({
      fill: new Fill({
        color: 'rgba(65, 105, 225, 0.2)'
      }),
      stroke: new Stroke({
        color: '#4169E1',
        width: 1.5
      })
    });
  }, []);

  const createSelectedSubbasinStyle = useCallback(() => {
    return new Style({
      fill: new Fill({
        color: 'rgba(255, 215, 0, 0.3)'
      }),
      stroke: new Stroke({
        color: '#ffd700',
        width: 3
      })
    });
  }, []);

  // Memoized coordinate conversion functions
  const coordinateUtils = useMemo(() => ({
    wgsToView: (lon, lat) => fromLonLat([lon, lat]),
    viewToWgs: (coord3857) => {
      const [lon, lat] = toLonLat(coord3857);
      return { lon, lat };
    },
    asNumber: (v) => (v === null || v === undefined || v === '' ? null : Number(v))
  }), []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }, []);

  return {
    debouncedViewChange,
    createStationStyle,
    createSelectedStationStyle,
    createSubbasinStyle,
    createSelectedSubbasinStyle,
    coordinateUtils,
    cleanup
  };
};
