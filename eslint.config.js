import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['frontend/dist/', 'node_modules/', 'src-tauri/target/', 'src-tauri/gen/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['frontend/**/*.{ts,vue}', '*.{ts,js}'],
    languageOptions: {
      globals: globals.browser
    }
  },
  prettier
]
