import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * The API is native ESM, so its source imports carry `.js` extensions that
 * actually refer to `.ts` files. Vite does not remap those, so this plugin does.
 */
const resolveTsFromJs = {
  name: 'resolve-ts-from-js',
  resolveId(source: string, importer: string | undefined) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;
    const candidate = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
    return existsSync(candidate) ? candidate : null;
  },
};

export default defineConfig({
  plugins: [resolveTsFromJs],
  esbuild: {
    // Nest decorators are the legacy TypeScript flavour.
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        target: 'es2022',
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    // @nestjs/core's Reflector and SetMetadata both need the metadata polyfill.
    setupFiles: ['reflect-metadata'],
    environment: 'node',
  },
});
