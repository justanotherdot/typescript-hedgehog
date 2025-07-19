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
    'no-console': 'warn',
    'no-debugger': 'error',
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/', '*.js'],
};