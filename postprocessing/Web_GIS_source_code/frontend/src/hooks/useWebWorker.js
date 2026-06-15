import { useCallback, useEffect, useRef } from 'react';

// Hook za upravljanje Web Worker-ima
export const useWebWorker = (workerScript) => {
  const workerRef = useRef(null);
  const messageHandlersRef = useRef(new Map());

  // Inicijalizacija worker-a
  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      try {
        workerRef.current = new Worker(workerScript);
        
        workerRef.current.onmessage = (e) => {
          const { type, data, error } = e.data;
          
          if (error) {
            console.error('Web Worker error:', error);
            return;
          }
          
          const handler = messageHandlersRef.current.get(type);
          if (handler) {
            handler(data);
          }
        };
        
        workerRef.current.onerror = (error) => {
          console.error('Web Worker error:', error);
        };
      } catch (error) {
        console.error('Failed to create Web Worker:', error);
      }
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      messageHandlersRef.current.clear();
    };
  }, [workerScript]);

  // Funkcija za slanje poruka worker-u
  const postMessage = useCallback((type, data, options = {}) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type, data, options });
    } else {
      console.warn('Web Worker not available, falling back to main thread');
      // Fallback na glavni thread ako worker nije dostupan
      return handleFallback(type, data, options);
    }
  }, []);

  // Registracija handler-a za odgovore
  const onMessage = useCallback((type, handler) => {
    messageHandlersRef.current.set(type, handler);
  }, []);

  // Uklanjanje handler-a
  const removeMessageHandler = useCallback((type) => {
    messageHandlersRef.current.delete(type);
  }, []);

  // Fallback funkcije za slučaj kada worker nije dostupan
  const handleFallback = (type, data, options) => {
    return new Promise((resolve, reject) => {
      try {
        let result;
        switch (type) {
          case 'PROCESS_STATIONS':
            result = processStationsDataFallback(data);
            break;
          case 'PROCESS_SUBBASINS':
            result = processSubbasinsDataFallback(data);
            break;
          default:
            throw new Error(`Unknown message type: ${type}`);
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  };

  return {
    postMessage,
    onMessage,
    removeMessageHandler,
    isWorkerAvailable: !!workerRef.current
  };
};

// Fallback funkcije
function processStationsDataFallback(stations) {
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

function processSubbasinsDataFallback(subbasins) {
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

function asNumber(v) {
  return (v === null || v === undefined || v === '' ? null : Number(v));
}
