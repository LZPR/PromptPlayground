import { defineStore } from 'pinia'
import { clearApiKey, DEFAULT_GLOBAL_SETTINGS, updateSettings } from '@/domain'
import type { GlobalSettings, SavedSettings } from '@/domain'
import type { SettingsRepository } from '@/repositories'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...DEFAULT_GLOBAL_SETTINGS } as GlobalSettings,
    initialized: false
  }),
  actions: {
    async initialize(repository: SettingsRepository) {
      this.settings = await repository.load()
      this.initialized = true
    },

    async save(repository: SettingsRepository, changes: Partial<SavedSettings>) {
      const next = updateSettings(this.settings, changes)
      const saved = await repository.save({
        baseUrl: next.baseUrl,
        model: next.model,
        temperature: next.temperature,
        maxOutput: next.maxOutput,
        stream: next.stream,
        displayMode: next.displayMode
      })
      this.settings = saved
      return saved
    },

    async replaceApiKey(repository: SettingsRepository, value: string) {
      this.settings = await repository.saveApiKey(value)
      return this.settings
    },

    async clearApiKey(repository: SettingsRepository) {
      const saved = await repository.clearApiKey()
      this.settings = clearApiKey(saved)
      return this.settings
    }
  }
})
