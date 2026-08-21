export type DisplayMode = 'raw' | 'markdown'

export interface GlobalSettings {
  readonly baseUrl: string
  readonly apiKeyPresent: boolean
  readonly model: string
  readonly temperature: number
  readonly maxOutput: number
  readonly stream: boolean
  readonly displayMode: DisplayMode
}

export type SavedSettings = Omit<GlobalSettings, 'apiKeyPresent'>

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  baseUrl: '',
  apiKeyPresent: false,
  model: '',
  temperature: 0.7,
  maxOutput: 1024,
  stream: true,
  displayMode: 'markdown'
}

export function updateSettings(
  settings: GlobalSettings,
  changes: Partial<GlobalSettings>
): GlobalSettings {
  return { ...settings, ...changes }
}

export function clearApiKey(settings: GlobalSettings): GlobalSettings {
  return { ...settings, apiKeyPresent: false }
}
