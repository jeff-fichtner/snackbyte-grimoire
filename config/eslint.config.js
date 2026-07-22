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
    // A TenantRef has no public constructor, so the only way to forge one is a double
    // assertion through `unknown`. That phrase is banned here rather than merely frowned
    // at: the guarantee is worth exactly as much as the difficulty of bypassing it.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
          message:
            'Double assertion through `unknown` is banned in src/. If you are reaching for it to build a TenantRef, mint one in core/law from verified evidence instead.',
        },
      ],
    },
  },
  {
    // tenant-ref.ts is the one place a reference is legitimately constructed.
    files: ['src/core/law/tenant-ref.ts'],
    rules: { 'no-restricted-syntax': 'off' },
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
