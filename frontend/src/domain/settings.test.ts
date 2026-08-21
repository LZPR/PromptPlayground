import { describe, expect, it } from 'vitest'
import { clearApiKey, DEFAULT_GLOBAL_SETTINGS, updateSettings } from './settings'

describe('[settings] update [changes only supplied fields]', () => {
  it('preserves all other settings', () => {
    const next = updateSettings({ ...DEFAULT_GLOBAL_SETTINGS, apiKeyPresent: true, baseUrl: 'https://example.test' }, { model: 'test-model' })
    expect(next).toEqual({ ...DEFAULT_GLOBAL_SETTINGS, apiKeyPresent: true, baseUrl: 'https://example.test', model: 'test-model' })
  })

  it('clears only the API key presence flag', () => {
    expect(clearApiKey({ ...DEFAULT_GLOBAL_SETTINGS, apiKeyPresent: true, model: 'model' })).toEqual({ ...DEFAULT_GLOBAL_SETTINGS, model: 'model' })
  })
})
