import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false, // This ensures it will try the next port if 5173 is occupied
    open: true // Automatically open the browser
  }
})
