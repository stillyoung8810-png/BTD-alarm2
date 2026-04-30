import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..', '..'),
    },
  },
  test: {
    include: ['docs2/toss_point/toss_point_reward_simulation.test.ts'],
    environment: 'node',
    globals: false,
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
