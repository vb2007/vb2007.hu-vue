import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'],
  },

  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),
  
  {
    // Every API call goes through src/scripts/api/client.ts (see README, "Calling the API").
    name: 'app/api-calls-through-the-client',
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/scripts/api/**', 'src/scripts/uploads/upload.ts', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Call the API with apiRequest from @/scripts/api/client.' },
        {
          name: 'XMLHttpRequest',
          message: 'Call the API with apiRequest from @/scripts/api/client.'
        }
      ]
    }
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/**/*'],
  },
  skipFormatting,
]
