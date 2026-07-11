import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Scratch review route for the 3D equipment/vessel library (?gallery=1). Lazy so
// the heavy 3D chunk never enters the runner's initial bundle.
const EquipmentGallery = lazy(() => import('./vessel/equipment/Gallery.jsx'))
const showGallery = new URLSearchParams(window.location.search).get('gallery')

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {showGallery ? (
      <Suspense fallback={<div className="app"><div className="loading">Loading gallery…</div></div>}>
        <EquipmentGallery />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
