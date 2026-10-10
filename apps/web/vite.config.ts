import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@cloudattend/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so app deploys do not invalidate the large Amplify/React downloads.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](@aws-amplify|aws-amplify|@aws-crypto|@aws-sdk|@smithy)[\\/]/.test(id)) return 'vendor-amplify';
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/](radix-ui|@radix-ui)[\\/]/.test(id)) return 'vendor-radix';
          return undefined;
        }
      }
    }
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], include: ['src/**/*.test.{ts,tsx}'] }
});
