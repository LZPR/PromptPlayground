import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_GLOBAL_SETTINGS } from '@/domain'
import type { SettingsRepository } from '@/repositories'
import { useSettingsStore } from './settings'

function repository(overrides: Partial<SettingsRepository> = {}): SettingsRepository {
  return {
    repositoryType: 'settings',
    load: vi.fn().mockResolvedValue(DEFAULT_GLOBAL_SETTINGS),
    save: vi.fn().mockImplementation(async (settings) => ({ ...settings, apiKeyPresent: false })),
    saveApiKey: vi.fn().mockResolvedValue({ ...DEFAULT_GLOBAL_SETTINGS, apiKeyPresent: true }),
    clearApiKey: vi.fn().mockResolvedValue(DEFAULT_GLOBAL_SETTINGS),
    ...overrides
  }
}

describe('[settings store] persistence [updates only after a successful command]', () => {
  it('loads, saves fields, and clears the key flag', async () => {
    setActivePinia(createPinia())
    const store = useSettingsStore()
    const storage = repository()
    await store.initialize(storage)
    await store.save(storage, { model: 'model-a' })
    expect(store.settings.model).toBe('model-a')
    await store.replaceApiKey(storage, 'key')
    expect(store.settings.apiKeyPresent).toBe(true)
    await store.clearApiKey(storage)
    expect(store.settings.apiKeyPresent).toBe(false)
  })
})
