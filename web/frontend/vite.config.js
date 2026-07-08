import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single-purpose app. The bundled public/parsed.json is the default, zero-backend
// data source so the demo always renders. A future live-parse endpoint can be
// pointed at via VITE_API_BASE without touching the bundled path.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
