import React, { useState, useEffect, useRef } from 'react';
import './StationSearch.css';

/**
 * StationSearch - Component for searching stations
 * @param {Object} props
 * @param {Array} props.stations - Array of station objects
 * @param {Function} props.onStationSelect - Callback when a station is selected
 * @param {Function} props.onDropdownToggle - Callback when dropdown opens/closes with height info
 */
const StationSearch = ({ stations, onStationSelect, onDropdownToggle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredStations, setFilteredStations] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Notify parent about dropdown state changes with height measurement
  useEffect(() => {
    if (onDropdownToggle) {
      let dropdownHeight = 0;
      
      if (isOpen && dropdownRef.current) {
        // Measure the actual dropdown height after it renders
        setTimeout(() => {
          if (dropdownRef.current) {
            dropdownHeight = dropdownRef.current.offsetHeight;
            onDropdownToggle({ isOpen: true, dropdownHeight });
          }
        }, 10); // Small delay to ensure DOM is updated
      } else {
        onDropdownToggle({ isOpen: false, dropdownHeight: 0 });
      }
    }
  }, [isOpen, onDropdownToggle, filteredStations.length]); // Include filteredStations.length to recalculate when results change

  // Filter stations based on search term
  useEffect(() => {
    if (!searchTerm || !stations) {
      setFilteredStations([]);
      setIsOpen(false);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = stations.filter((station) => {
      const stationName = station.Station?.toLowerCase() || '';
      const country = station.Country?.toLowerCase() || '';
      const river = station.River?.toLowerCase() || '';
      const subbasin = station.Subbasin?.toLowerCase() || '';

      return (
        stationName.includes(term) ||
        country.includes(term) ||
        river.includes(term) ||
        subbasin.includes(term)
      );
    });

    setFilteredStations(filtered.slice(0, 10)); // Limit to 10 results
    setIsOpen(filtered.length > 0);
    setSelectedIndex(-1);
  }, [searchTerm, stations]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || filteredStations.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prevIndex) =>
          prevIndex < filteredStations.length - 1 ? prevIndex + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prevIndex) =>
          prevIndex > 0 ? prevIndex - 1 : filteredStations.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredStations.length) {
          handleSelectStation(filteredStations[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        break;
      default:
        break;
    }
  };

  // Handle station selection
  const handleSelectStation = (station) => {
    setSearchTerm(station.Station || '');
    setIsOpen(false);
    
    if (onStationSelect) {
      onStationSelect(station);
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (filteredStations.length > 0) {
      setIsOpen(true);
    }
  };

  // Clear search
  const handleClear = () => {
    setSearchTerm('');
    setIsOpen(false);
    setFilteredStations([]);
  };

  return (
    <div className="station-search-container" data-hover-ignore>
      <div className="station-search-input-wrapper" ref={searchRef}>
        <div className="station-search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </div>
        <input
          type="text"
          className="station-search-input"
          placeholder="Search stations..."
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />
        {searchTerm && (
          <button className="station-search-clear" onClick={handleClear} type="button" data-tooltip="clearSearch" aria-label="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>

      {isOpen && filteredStations.length > 0 && (
        <div className="station-search-dropdown" ref={dropdownRef}>
          <div className="station-search-results">
            {filteredStations.map((station, index) => (
              <button
                key={station.id || index}
                type="button"
                className={`station-search-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelectStation(station)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="station-search-item-header">
                  <span className="station-search-item-name">{station.Station || 'N/A'}</span>
                  {station.Country && (
                    <span className="station-search-item-country">{station.Country}</span>
                  )}
                </div>
                <div className="station-search-item-details">
                  {station.River && (
                    <span className="station-search-item-detail">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                      </svg>
                      {station.River}
                    </span>
                  )}
                  {station.Subbasin && (
                    <span className="station-search-item-detail">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      {station.Subbasin}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="station-search-footer">
            {filteredStations.length} result{filteredStations.length !== 1 ? 's' : ''} found
          </div>
        </div>
      )}

      {isOpen && searchTerm && filteredStations.length === 0 && (
        <div className="station-search-dropdown" ref={dropdownRef}>
          <div className="station-search-no-results">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <p>No stations found</p>
            <span>Try a different search term</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StationSearch;

