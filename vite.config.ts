import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

const CLIENT_ENV_PREFIXES = [
  'VITE_BENEFIT_',
  'VITE_BACKTEST_',
  'VITE_FIREBASE_',
  'VITE_GEMINI_',
  'VITE_PLAN_AMOUNT_',
  'VITE_RAILWAY_',
  'VITE_SITE_',
  'VITE_SUPABASE_',
  'VITE_TELEGRAM_',
  'VITE_TOSS_',
  'VITE_WORKER_',
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isAnalyze = mode === 'analyze';

  const plugins: PluginOption[] = [react()];
  if (isAnalyze) {
    plugins.push(
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        open: false,
        template: 'treemap',
      }) as PluginOption
    );
  }

  return {
    envPrefix: [...CLIENT_ENV_PREFIXES],
    server: {
      port: 5173,
      host: 'localhost',
    },
    build: {
      chunkSizeWarningLimit: 950,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-core';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('dexie') || id.includes('@supabase/supabase-js')) return 'vendor-db';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      include: ['recharts'],
    },
    plugins,
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
