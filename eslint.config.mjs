import eslintConfig from '@electron-toolkit/eslint-config'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'

export default [
  { ignores: ['**/node_modules', '**/dist', '**/out', '*.js', 'scripts/**/*.js', 'build/**/*.js'] },
  {
    plugins: {
      react: eslintPluginReact
    },
    files: ['**/*.js', '**/*.jsx'],
    ...eslintConfig,
    languageOptions: {
      ...eslintConfig.languageOptions,
      parserOptions: {
        ...eslintConfig.languageOptions?.parserOptions,
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      ...eslintConfig.rules,
      ...eslintPluginReact.configs.recommended.rules,
      ...eslintPluginReact.configs['jsx-runtime'].rules,
      'no-unused-vars': 'warn',
      'react/prop-types': 'off'
    }
  },
  eslintConfigPrettier
]
