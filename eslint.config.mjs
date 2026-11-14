// @ts-check
import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'addons/*/src/third-party/*.ts',
      'src/vs/*',
      'out/*',
      'out-test/*',
      'out-esbuild/*',
      'out-esbuild-test/*',
      '**/inwasm-sdks/*',
      '**/typings/*.d.ts',
      '**/node_modules',
      '**/*.js',
      '**/*.mjs'
    ]
  },
  {
    linterOptions: {
      // Same as legacy .eslintrc behaviour: stale disable comments are not reported.
      reportUnusedDisableDirectives: 'off'
    }
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@stylistic': stylistic,
      '@typescript-eslint': tseslint.plugin,
      jsdoc
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@stylistic/indent': ['warn', 2],
      '@stylistic/semi': ['warn', 'always'],
      '@stylistic/quotes': ['warn', 'single', { allowTemplateLiterals: 'always' }],

      '@typescript-eslint/array-type': ['warn', {
        default: 'array',
        readonly: 'generic'
      }],
      '@typescript-eslint/consistent-type-assertions': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'warn',
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true
      }],
      '@typescript-eslint/explicit-member-accessibility': ['warn', {
        accessibility: 'explicit',
        overrides: {
          constructors: 'off'
        }
      }],
      '@stylistic/member-delimiter-style': ['warn', {
        multiline: {
          delimiter: 'semi',
          requireLast: true
        },
        singleline: {
          delimiter: 'comma',
          requireLast: false
        }
      }],
      '@typescript-eslint/naming-convention': [
        'warn',
        { selector: 'default', format: ['camelCase'],
          filter: {
            regex: '^[a-z]',
            match: true
          }
        },
        // variableLike
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'variable', filter: '^I.+Service$', format: ['PascalCase'], prefix: ['I'] },
        // memberLike
        { selector: 'memberLike', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'require' },
        { selector: 'memberLike', modifiers: ['protected'], format: ['camelCase'], leadingUnderscore: 'require' },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        // memberLike - Allow enum-like objects to use UPPER_CASE
        { selector: 'property', modifiers: ['public'], format: ['camelCase', 'UPPER_CASE'],
          filter: {
            regex: '^[a-z]',
            match: true
          }
        },
        // restrict on* naming for events only
        { selector: 'method', modifiers: ['public'], format: ['camelCase', 'UPPER_CASE'], custom: {
          regex: '^on[A-Z].+',
          match: false
        } },
        { selector: 'method', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'require', custom: {
          regex: '^on[A-Z].+',
          match: false
        } },
        { selector: 'method', modifiers: ['protected'], format: ['camelCase'], leadingUnderscore: 'require', custom: {
          regex: '^on[A-Z].+',
          match: false
        } },
        // typeLike
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'interface', format: ['PascalCase'], prefix: ['I'] }
      ],
      '@typescript-eslint/no-confusing-void-expression': ['warn', {
        ignoreArrowShorthand: true
      }],
      '@typescript-eslint/no-useless-constructor': 'warn',
      '@typescript-eslint/prefer-namespace-keyword': 'warn',
      '@stylistic/type-annotation-spacing': 'warn',

      'comma-dangle': ['warn', {
        objects: 'never',
        arrays: 'never',
        functions: 'never'
      }],
      'curly': ['warn', 'multi-line'],
      'eol-last': 'warn',
      'eqeqeq': ['warn', 'always'],
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-param-names': 'warn',
      'jsdoc/no-multi-asterisks': 'warn',
      'keyword-spacing': 'warn',
      'max-len': ['warn', {
        code: 1000, // Don't enforce for code
        comments: 100,
        ignoreTrailingComments: true,
        ignoreUrls: true,
        ignorePattern: '^ *((?<vt_comment>(//|\\*) @vt)|(?<table_comment>\\* \\| )|(?<commented_code>//  ))'
      }],
      'new-parens': 'warn',
      'no-duplicate-imports': 'warn',
      'no-else-return': ['warn', {
        allowElseIf: false
      }],
      'no-eval': 'warn',
      'no-extra-semi': 'error',
      'no-irregular-whitespace': 'warn',
      'no-restricted-imports': ['warn', {
        patterns: [
          '.*\\/out\\/.*'
        ]
      }],
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.name='requestAnimationFrame']",
          message: 'The global requestAnimationFrame() should be avoided, call it on the parent window from ICoreBrowserService.'
        },
        {
          selector: "CallExpression[callee.name='cancelAnimationFrame']",
          message: 'The global cancelAnimationFrame() should be avoided, call it on the parent window from ICoreBrowserService.'
        },
        {
          selector: "CallExpression > MemberExpression[object.name='window'][property.name='requestAnimationFrame']",
          message: 'window.requestAnimationFrame() should be avoided, call it on the parent window from ICoreBrowserService.'
        },
        {
          selector: "CallExpression > MemberExpression[object.name='window'][property.name='cancelAnimationFrame']",
          message: 'window.cancelAnimationFrame() should be avoided, call it on the parent window from ICoreBrowserService.'
        },
        {
          selector: "MemberExpression[object.name='window'][property.name='devicePixelRatio']",
          message: 'window.devicePixelRatio should be avoided, get it from ICoreBrowserService.'
        }
      ],
      'no-trailing-spaces': 'warn',
      'no-unsafe-finally': 'warn',
      'no-unused-vars': ['warn', {
        vars: 'all',
        args: 'none',
        caughtErrors: 'none'
      }],
      'no-var': 'warn',
      'one-var': ['warn', 'never'],
      'object-curly-spacing': ['warn', 'always'],
      'prefer-const': 'warn',
      'spaced-comment': ['warn', 'always', {
        markers: ['/'],
        exceptions: ['-']
      }]
    }
  },
  {
    files: [
      '**/*.api.ts',
      '**/*.test.ts'
    ],
    rules: {
      'object-curly-spacing': 'off',
      'max-len': 'off',
      'no-unused-vars': 'off'
    }
  }
);
