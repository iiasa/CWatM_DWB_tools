import { useCallback } from 'react';
import apiService from '../services/api.service';

/**
 * Hook za upravljanje selektovanim stanicama
 * @returns {Object} Hook funkcije i stanje
 */
const useStationSelection = () => {
  /**
   * Šalje selektovanu stanicu na backend
   * @param {Object} stationInfo - Podaci o stanici
   * @param {number} stationInfo.id - ID stanice
   * @param {string} stationInfo.Station - Naziv stanice
   * @param {number} stationInfo.lat - Širina
   * @param {number} stationInfo.lon - Dužina
   * @param {string} stationInfo.Country - Zemlja
   * @param {string} stationInfo.Subbasin - Subbasin
   * @param {string} stationInfo.River - Reka
   */
  const sendSelectedStation = useCallback(async (stationInfo) => {
    if (!stationInfo || !stationInfo.id) {
      console.warn('useStationSelection: No valid station info provided');
      return;
    }

    try {
      // Pripremi podatke za slanje
      const stationData = {
        id: stationInfo.id,
        station: stationInfo.Station || stationInfo.station,
        lat: stationInfo.lat,
        lon: stationInfo.lon,
        country: stationInfo.Country || stationInfo.country,
        subbasin: stationInfo.Subbasin || stationInfo.subbasin,
        river: stationInfo.River || stationInfo.river,
        timestamp: new Date().toISOString()
      };

      console.log('Sending station selection to backend:', stationData);

      // Pošalji na backend
      await apiService.request('/calib-stations/selected', {
        method: 'POST',
        body: JSON.stringify(stationData),
      });

      console.log('Station selection sent successfully');
    } catch (error) {
      console.error('Error sending station selection:', error);
      throw error;
    }
  }, []);

  return {
    sendSelectedStation
  };
};

export default useStationSelection;
