import { defineConfig } from "vite-plus";

export default defineConfig({
  check: {
    fmt: false,
    lint: true,
  },
  fmt: {
    ignorePatterns: [
      ".codex/artifacts/**",
      ".codex/work/**",
      "**/_generated/**",
      "**/dist/**",
      "**/dist-test/**",
    ],
    semi: true,
    singleQuote: false,
  },
  lint: {
    ignorePatterns: [
      ".codex/artifacts/**",
      ".codex/work/**",
      "**/_generated/**",
      "**/dist/**",
      "**/dist-test/**",
    ],
    options: {
      typeAware: false,
      typeCheck: false,
    },
    plugins: ["typescript"],
    rules: {
      "no-debugger": "error",
      "no-explicit-any": "error",
    },
  },
  run: {
    cache: {
      scripts: false,
      tasks: true,
    },
  },
});
