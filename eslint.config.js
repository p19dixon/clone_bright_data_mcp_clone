import js from '@eslint/js';
import eslintPluginImport from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'apps/bright-mcp-clone/**',
      'apps/mcp-bridge/**',
      'reference/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      import: eslintPluginImport
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/order': [
        'warn',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always'
        }
      ]
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.node
      }
    }
  }
);
