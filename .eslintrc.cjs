module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    node: true,
    es6: true,
    browser: true,
  },
  globals: {
    NodeJS: 'readonly',
    Worker: 'readonly',
    ErrorEvent: 'readonly',
    navigator: 'readonly',
    globalThis: 'readonly',
  },
  rules: {
    'prefer-const': 'error',
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true
    }],

    // Code quality
    'no-console': 'off', // Allow console statements for debugging worker infrastructure
    'no-debugger': 'error',
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/', '*.js', '**/*.bench.ts'],
};
