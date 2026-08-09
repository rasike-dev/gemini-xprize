import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypescript,
];
