module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:import/recommended', 'plugin:import/typescript'],
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
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    
    // Enforce ESM and named exports for better static analysis
    'import/no-commonjs': 'error',
    'import/no-dynamic-require': 'error', 
    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
    
    // Performance and tree shaking
    'import/no-namespace-import': 'warn',
    
    // Code quality
    'no-console': 'warn',
    'no-debugger': 'error',
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/', '*.js'],
};