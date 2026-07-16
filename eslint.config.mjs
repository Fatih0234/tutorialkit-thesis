import blitzPlugin from '@blitz/eslint-plugin';
import { getNamingConventionRule, tsFileExtensions } from '@blitz/eslint-plugin/dist/configs/typescript.js';
import eslintPluginAstro from 'eslint-plugin-astro';

const namingConventionOptions = {
  variable: {
    exceptions: ['Content', '__ENTERPRISE__', '__WC_CONFIG__', 'WebContainer'],
  },
};

function getPracticalNamingConventionRule(tsx = false) {
  const rule = getNamingConventionRule(namingConventionOptions, tsx)['@typescript-eslint/naming-convention'];
  const [severity, ...selectors] = rule;

  return {
    '@typescript-eslint/naming-convention': [
      severity,
      ...selectors.map((selector) =>
        typeof selector === 'object' && selector.selector === 'memberLike'
          ? { ...selector, leadingUnderscore: 'allow' }
          : selector,
      ),
    ],
  };
}

export default [
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/.astro/**',
      '**/.vscode-test/**',

      // we ignore our demo templates because they may contain code that is formatted specifically for the demo
      'docs/demo/src/templates',
    ],
  },
  ...blitzPlugin.configs.recommended({
    ts: {
      namingConvention: namingConventionOptions,
    },
  }),
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['**/env.d.ts', '**/env-default.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',

      'multiline-comment-style': 'off',
    },
  },
  {
    files: tsFileExtensions,
    rules: {
      // we turn this off in favor of TypeScripts's `noImplicitReturns`
      'consistent-return': 'off',

      '@typescript-eslint/no-this-alias': 'off',

      ...getPracticalNamingConventionRule(false),
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      ...getPracticalNamingConventionRule(true),
    },
  },
  {
    rules: {
      '@blitz/catch-error-name': 'off',
      '@blitz/comment-syntax': 'off',
      '@blitz/newline-before-return': 'off',
      'import/order': 'off',
      'multiline-comment-style': 'off',
      'padding-line-between-statements': 'off',
      'prefer-arrow-callback': 'off',
      'prettier/prettier': 'off',
    },
  },
];
