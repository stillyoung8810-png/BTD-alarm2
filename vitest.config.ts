import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'utils/**/*.test.ts',
      'components/**/*.test.tsx',
      'hooks/**/*.test.ts',
      'server/src/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
    ],
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
    ],
  },
});

