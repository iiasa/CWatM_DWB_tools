import React, { Suspense, lazy } from 'react';
import './App.css';
import Logo from './components/Logo';

// Lazy load Geoportal komponentu za bolje performanse
const GeoportalOptimized = lazy(() => import('./pages/GeoportalOptimized'));

// Loading komponenta
const LoadingSpinner = () => (
  <div className="app-loading-fallback">
    <div className="app-loading-fallback-inner">
      <div className="app-loading-fallback-spinner" />
      <span>Učitavanje mape...</span>
    </div>
  </div>
);

function AppOptimized() {
  return (
    <div className="App">
      <Logo />
      <Suspense fallback={<LoadingSpinner />}>
        <GeoportalOptimized />
      </Suspense>
    </div>
  );
}

export default AppOptimized;
