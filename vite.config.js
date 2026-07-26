import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        knowledge: resolve(__dirname, 'knowledge.html'),
        quiz: resolve(__dirname, 'quiz.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: '/knowledge.html',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
