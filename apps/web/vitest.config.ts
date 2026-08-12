import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/client.ts',
        'src/lib/use-action.ts',
        'src/components/agent-run-buttons.tsx',
        'src/components/customer-form.tsx',
        'src/components/line-items-editor.tsx',
        'src/components/report-export-buttons.tsx',
        'src/components/settings-form.tsx',
        'src/components/sidebar.tsx',
        'src/components/usage-bar.tsx',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 60,
        functions: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
