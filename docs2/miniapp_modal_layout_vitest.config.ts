import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['docs2/miniapp_modal_layout_simulation.test.ts'],
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
      'server/**',
      'supabase/**',
    ],
    typecheck: {
      enabled: true,
      checker: 'tsc',
      tsconfig: './tsconfig.json',
    },
  },
});
