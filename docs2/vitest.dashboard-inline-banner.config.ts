import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['docs2/dashboard_inline_banner_ad_simulation.test.ts'],
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
