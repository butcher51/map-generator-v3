import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Playwright owns tests/smoke.spec.js; Vitest owns the *.test.js files.
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Only the pure modules are held to a coverage floor. Canvas and DOM
      // wiring is covered by the Playwright smoke test instead, and a
      // threshold over untestable code only encourages fake tests.
      include: ['src/generator.js', 'src/viewport.js', 'dashboard/lib.js'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
