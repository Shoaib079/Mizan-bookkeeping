import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `node` stays the default. Almost every test here reads source or calls a
    // pure function, and jsdom costs about two seconds of setup per file — the
    // suite is 153 files. A test that renders a component opts in with
    // `// @vitest-environment jsdom` on its first line.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  // Next's tsconfig says `jsx: "preserve"`, because Next does the transform
  // itself. Vitest transforms with esbuild and has no such step, so a .tsx
  // test failed with "React is not defined" — the classic runtime error for
  // JSX compiled to `React.createElement` without React in scope.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
