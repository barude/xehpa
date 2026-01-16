import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/xehpa/' : '/',
  plugins: [
    react(),
    // Plugin to handle jszip as external
    {
      name: 'external-jszip',
      resolveId(id) {
        if (id === 'jszip') {
          // Return a virtual module ID that won't be resolved
          return { id: 'jszip', external: true };
        }
        return null;
      },
    },
  ],
  optimizeDeps: {
    exclude: ['jszip'], // Exclude jszip from pre-bundling - we'll load it from CDN at runtime
  },
});
