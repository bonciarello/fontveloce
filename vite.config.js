import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: {
    host: '0.0.0.0',
    port: process.env.PORT || 4601,
  },
  build: {
    target: 'es2020',
  },
  optimizeDeps: {
    exclude: ['fonteditor-core'],
  },
});
