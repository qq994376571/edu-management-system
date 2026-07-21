import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  cacheDir: '.vite-cache',
  plugins: [react(), tailwindcss()],
  base: './', // Use relative paths for electron
  server: {
    watch: {
      ignored: ['**/release/**']
    }
  }
})
