import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single-purpose app. The bundled public/parsed.json is the default, zero-backend
// data source so the demo always renders. A future live-parse endpoint can be
// pointed at via VITE_API_BASE without touching the bundled path.
export default defineConfig({
  plugins: [react()],
  // Pin the dev port: every capture script defaults to BASE=http://localhost:4319,
  // and the harness routes (?models=1, ?matrix=1) only exist on the DEV server.
  // strictPort makes a port clash fail loudly instead of silently moving the
  // server somewhere the scripts will not find it.
  server: { port: 4319, strictPort: true },
  preview: { port: 4319, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy 3D stack into its own long-cached vendor chunk.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
