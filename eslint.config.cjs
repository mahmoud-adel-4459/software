'use strict';
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'artifacts/**',
      'private/**',
      'legacy-archive/**',
      'legacy-export/**',
      'renderer-app/**',
      'native/**',
      'play-user-data/**',
      'lab-user-data/**',
      'backend/src/generated/**',
      'backend/dist/**',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // Browser scripts share one global scope; each file lists what it provides.
    files: ['renderer/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': 'off', 'no-undef': 'off' },
  },
  {
    files: ['scripts/preview-bridge.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, previewSecret: 'readonly' } },
  },
  // Backend (TypeScript): typescript-eslint recommended; type safety itself is enforced by `npm run backend:typecheck`.
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['backend/**/*.ts'] })),
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  { files: ['backend/**/*.mjs'], languageOptions: { sourceType: 'module', globals: globals.node } },
];
