/// <reference types="vitest/config" />
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Fixed build-time nonce shared by the CSP meta tag and the emotion cache (<meta name="csp-nonce">). */
export const CSP_NONCE = 'ma-renderer-7f3a91c2';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  `style-src 'self' 'nonce-${CSP_NONCE}'`,
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Injects the CSP + nonce meta tags into the production index.html and drops `crossorigin` (file:// pages). */
function cspPlugin(): Plugin {
  return {
    name: 'ma-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n    <meta name="csp-nonce" content="${CSP_NONCE}">`;
        return html.replace(/\scrossorigin(="[^"]*")?/g, '').replace('<meta charset="UTF-8" />', (m) => `${m}\n    ${meta}`);
      },
    },
    // Vite adds its tags after the html hooks, so the final page is patched once the bundle is written:
    // a classic deferred script (module scripts are blocked from file:// origins in plain Chromium).
    closeBundle() {
      const file = fileURLToPath(new URL('./dist/index.html', import.meta.url));
      const html = readFileSync(file, 'utf8')
        .replace(/\scrossorigin(="[^"]*")?/g, '')
        .replace(/<script type="module"([^>]*)>/g, '<script defer$1>')
        .replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
      writeFileSync(file, html);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), cspPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __DEV_MOCK__: JSON.stringify(mode === 'development') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    // One classic bundle (no ES-module chunks) so the page also loads from file:// without CORS errors.
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 20000,
  },
}));
