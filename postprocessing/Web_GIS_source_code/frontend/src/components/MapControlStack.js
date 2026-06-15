import './MapControlStack.css';
import Logo from './Logo';
import StationSearch from './StationSearch';

/**
 * MapControlStack - Single frosted card combining the DWB funding logo (top)
 * and the station search (bottom), separated by a hairline. Owns the shared
 * plate styling; Logo and StationSearch render as transparent zones inside it.
 *
 * @param {Object} props
 * @param {Array} props.stations - Array of station objects (forwarded to search)
 * @param {Function} props.onStationSelect - Callback when a station is selected
 */
const MapControlStack = ({ stations, onStationSelect }) => {
  return (
    <div className="map-control-stack" data-hover-ignore>
      <Logo />
      <StationSearch stations={stations} onStationSelect={onStationSelect} />
    </div>
  );
};

export default MapControlStack;
