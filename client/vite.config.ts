import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/dz/',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/dz/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dz/, ''),
      },
      '/dz/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dz/, ''),
      },
    },
  },
});
