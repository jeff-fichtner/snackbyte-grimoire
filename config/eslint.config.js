import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.tsbuildinfo', 'design/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // The dependency runs binding -> core, never the reverse. Core defines the interfaces;
    // a binding implements them and is injected at the composition root. Enforced rather
    // than trusted: the predecessor inverted this and only discovered the cost when a
    // second platform was considered.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/bindings/*', '**/bindings/**'],
              message:
                'core must not import a binding. Define the interface in core and inject the implementation at the composition root.',
            },
            {
              group: ['discord.js', 'discord.js/*'],
              message: 'core names no platform. discord.js belongs only in src/bindings/discord/.',
            },
          ],
        },
      ],
    },
  },
  {
    // Binding-facing frontend code also runs in the browser.
    files: ['src/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettier,
);
