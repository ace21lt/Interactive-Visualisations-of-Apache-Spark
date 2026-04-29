import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://backend:8080',
      '/trigger': 'http://backend:8080'
    }
  }
});


