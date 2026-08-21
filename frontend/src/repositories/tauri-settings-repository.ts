import type { GlobalSettings, SavedSettings } from '@/domain'
import {
  clearStoredApiKey,
  loadStoredSettings,
  saveStoredApiKey,
  saveStoredSettings
} from '@/services/backend'
import type { SettingsRepository } from './index'

export class TauriSettingsRepository implements SettingsRepository {
  readonly repositoryType = 'settings' as const

  load(): Promise<GlobalSettings> {
    return loadStoredSettings()
  }

  save(settings: SavedSettings): Promise<GlobalSettings> {
    return saveStoredSettings(settings)
  }

  saveApiKey(value: string): Promise<GlobalSettings> {
    return saveStoredApiKey(value)
  }

  clearApiKey(): Promise<GlobalSettings> {
    return clearStoredApiKey()
  }
}
