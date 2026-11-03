import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      // Tests never read a real .env, so the API base URL is pinned here.
      env: {
        VITE_API_BASE_URL: 'https://api.test',
      },
      setupFiles: ['src/__tests__/setup.ts'],
      // CI runs several jobs at once on a shared 4-core host, so a test can take several times longer
      // there than locally. Locally the defaults (5 s, 10 s) still catch a hang quickly.
      testTimeout: process.env.CI ? 30_000 : 5_000,
      hookTimeout: process.env.CI ? 60_000 : 10_000,
      coverage: {
        provider: 'v8',
        // Every source file counts, tested or not (vitest's coverage.all is on by default),
        // so a new file without tests drops coverage below the thresholds and fails CI.
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/**/__tests__/**', '**/*.d.ts'],
        reporter: ['text', 'html', 'json-summary'],
        // Still write coverage when a test fails, so CI's coverage stage reports real numbers.
        reportOnFailure: true,
        // Keep in sync with the --threshold passed to .github/scripts/coverage-junit.mjs in ci.yml.
        thresholds: {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  }),
)
