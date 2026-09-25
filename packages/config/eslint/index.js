// Shared ESLint flat config for the Garba Partner monorepo.
// Usage (root eslint.config.js):
//   import { createEslintConfig } from '@garba-partner/config/eslint';
//   export default createEslintConfig({ tsconfigRootDir: import.meta.dirname });

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Imports that break the monorepo dependency rules (apps never import each other or package internals). */
const RESTRICTED_IMPORT_PATTERNS = [
  {
    group: ['@garba-partner/api', '@garba-partner/web', '@garba-partner/admin'],
    message: 'Apps must not import other apps. Move shared code to @garba-partner/shared.',
  },
  {
    group: ['@garba-partner/*/src', '@garba-partner/*/src/*', '@garba-partner/*/dist/*'],
    message: 'Import packages through their public entry points only.',
  },
];

/** Additional restrictions for browser code: never bundle server-only configuration. */
const FRONTEND_RESTRICTED_IMPORT_PATTERNS = [
  ...RESTRICTED_IMPORT_PATTERNS,
  {
    group: ['@garba-partner/config/server'],
    message: 'Server configuration must never be imported into browser code.',
  },
];

const FRONTEND_FILES = ['apps/web/src/**/*.{ts,tsx}', 'apps/admin/src/**/*.{ts,tsx}'];
const NODE_FILES = [
  'apps/api/**/*.ts',
  'packages/config/src/**/*.ts',
  'apps/*/vite.config.ts',
  '**/vitest.config.ts',
];

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export function createEslintConfig({ tsconfigRootDir }) {
  return defineConfig(
    globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', '**/*.tsbuildinfo', '.kilo/']),

    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        eqeqeq: ['error', 'smart'],
        'no-restricted-imports': ['error', { patterns: RESTRICTED_IMPORT_PATTERNS }],
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
      },
    },

    // Plain JavaScript files (configs) are not part of any tsconfig.
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },

    // Node.js code.
    {
      files: NODE_FILES,
      languageOptions: { globals: globals.node },
    },
    {
      files: ['apps/api/src/**/*.ts'],
      rules: { 'no-console': 'error' },
    },

    // Isomorphic shared package: no Node built-ins, it is bundled into browsers.
    {
      files: ['packages/shared/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              ...RESTRICTED_IMPORT_PATTERNS,
              { group: ['node:*'], message: '@garba-partner/shared must stay browser-safe.' },
            ],
          },
        ],
      },
    },

    // React apps.
    {
      files: FRONTEND_FILES,
      extends: [
        reactHooks.configs.flat['recommended-latest'],
        reactRefresh.configs.vite,
        jsxA11y.flatConfigs.recommended,
      ],
      languageOptions: { globals: globals.browser },
      rules: {
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'no-restricted-imports': ['error', { patterns: FRONTEND_RESTRICTED_IMPORT_PATTERNS }],
        'no-restricted-syntax': [
          'error',
          {
            selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
            message: 'Never render user content as HTML (security-architecture.md §6).',
          },
        ],
      },
    },

    // Must stay last: turns off stylistic rules that conflict with Prettier.
    prettier,
  );
}
