import { defineConfig } from 'tsup'
import { copy } from 'esbuild-plugin-copy'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  external: ['commander', '@anthropic-ai/claude-code', 'ink', 'react'],
  banner: {
    js: '#!/usr/bin/env node'
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
        }
      ]
    })
  ]
})