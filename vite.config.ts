import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

/** Highlighting, Markdown and language detection: only the pastebin pages need them. */
const PASTE_TEXT = [
  "/node_modules/highlight.js/",
  "/node_modules/markdown-it/",
  "/node_modules/mdurl/",
  "/node_modules/linkify-it/",
  "/node_modules/uc.micro/",
  "/node_modules/entities/",
  "/node_modules/punycode.js/",
  "/src/scripts/pastebin/detect.ts",
  "/src/scripts/pastebin/highlight.ts",
  "/src/scripts/pastebin/languages.ts",
  "/src/scripts/pastebin/markdown.ts"
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    allowedHosts: ["vb2007.hu", "www.vb2007.hu"]
  },
  build: {
    rollupOptions: {
      output: {
        // Left to itself, Rollup merges PASTE_TEXT into a chunk shared with BaseSelect, which the
        // Upload and Admin pages load too.
        manualChunks: (id) =>
          PASTE_TEXT.some((path) => id.includes(path)) ? "paste-text" : undefined
      }
    }
  }
});
