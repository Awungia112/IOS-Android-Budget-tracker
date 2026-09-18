import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: __dirname,
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3095',
        changeOrigin: true,
        secure: false,
      },
      // Proxy legacy API calls in dev to avoid CORS restrictions.
      // The browser sends to /legacy-api/..., Vite forwards to the legacy server.
      '/legacy-api': {
        target: 'https://www-test.mein-budget-app.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/legacy-api/, ''),
        secure: true,
      },
    },
  },
  preview: {
    port: 8080,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3095',
        changeOrigin: true,
        secure: false,
      },
      '/legacy-api': {
        target: 'https://www-test.mein-budget-app.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/legacy-api/, ''),
        secure: true,
      },
    },
  },
  css: {
    postcss: path.resolve(__dirname, '../../postcss.config.cjs'),
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version || '0.0.1'),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,webp,woff2,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'My Budget - Expenses under control',
        short_name: 'My Budget',
        description: 'Die kostenlose App zur Übersicht Ihrer Finanzen',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#1E90FF',
        icons: [
          {
            src: '/assets/logo-deutshland.png',
            sizes: '200x200',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@budget/core": path.resolve(__dirname, "../core/src"),
      "@budget/shared/session-token": path.resolve(__dirname, "../shared/src/session-token.ts"),
      "@budget/shared/sync-limits": path.resolve(__dirname, "../shared/src/sync-limits.ts"),
      "@budget/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-utils': ['@tanstack/react-query', 'lucide-react', 'clsx', 'tailwind-merge'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-slot', 'vaul'],
        }
      }
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['../../vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  }
}));
