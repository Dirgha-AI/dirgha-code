// Flat-config ESLint for @dirgha/code. Intentionally narrow:
// catches the high-signal mistakes (unused imports, no-shadow, no-empty,
// unsafe-equals) without burying authors in style nitpicks. We leave
// tsconfig's `noUnusedLocals` to handle structural unused-vars; this
// adds the runtime-impact checks that tsc does NOT cover.

import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default tseslint.config(
  {
    ignores: [
      'dist_v2/**',
      'dist/**',
      '_legacy_v1/**',
      'node_modules/**',
      'tools/vhs/**',
      'scripts/**/*.mjs',
      'scripts/**/*.sh',
      // Test files live outside the v2 tsconfig project; type-aware lint
      // rules can't run on them without spinning up a separate project,
      // and vitest already type-checks them at run time.
      'src_v2/**/__tests__/**',
      'src_v2/**/*.test.ts',
      'src_v2/**/*.spec.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src_v2/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.v2.json',
      },
    },
    rules: {
      // Catch real bugs, ignore stylistic preferences.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-shadow': 'off',
      // no-shadow: warn (not error) — pre-existing patterns like local
      // `resolve` shadowing the outer Promise resolver are intentional in
      // a few places. Catch new occurrences via review.
      '@typescript-eslint/no-shadow': ['warn', { ignoreOnInitialization: true }],
      // no-unused-expressions: warn — covers `void x` typing tricks that
      // lint can't see through.
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': ['warn', { allowShortCircuit: true, allowTaggedTemplates: true }],
      'eqeqeq': ['error', 'smart'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'prefer-const': 'error',
      '@typescript-eslint/no-require-imports': 'off',
      'no-useless-escape': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
