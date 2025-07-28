import { copy } from 'esbuild-plugin-copy';
import path from 'path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  external: ['commander', '@anthropic-ai/claude-code', 'ink', 'react'],
  esbuildOptions(options) {
    options.alias = {
      '~': path.resolve('./src'),
    };
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildPlugins: [
    copy({
      assets: [
        {
          from: ['./src/prompts/**/*'],
          to: ['./prompts'],
        },
        {
          from: ['./src/resources/**/*'],
          to: ['./resources'],
        },
        {
          from: ['./src/templates/**/*'],
          to: ['./templates'],
        },
        {
          from: ['./docs/recipes.md'],
          to: ['./docs/recipes.md'],
        },
      ],
    }),
  ],
});
