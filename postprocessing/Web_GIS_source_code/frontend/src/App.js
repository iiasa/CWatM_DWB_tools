import './App.css';
import Geoportal from './pages/Geoportal';
import ButtonTooltip from './components/tooltip/ButtonTooltip';

function App() {
  return (
    <div className="App">
      <Geoportal />
      {/* Global hover tooltip for any element with a data-tooltip attribute */}
      <ButtonTooltip />
    </div>
  );
}

export default App;
