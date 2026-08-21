import { invoke } from '@tauri-apps/api/core'
import type { GlobalSettings, SavedSettings } from '@/domain'

const browserSettings: GlobalSettings = {
  baseUrl: '',
  apiKeyPresent: false,
  model: '',
  temperature: 0.7,
  maxOutput: 1024,
  stream: true,
  displayMode: 'markdown'
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function healthCheck(): Promise<string> {
  return invoke<string>('health_check')
}

export async function loadStoredSettings(): Promise<GlobalSettings> {
  if (!isTauriRuntime()) return { ...browserSettings }
  return invoke<GlobalSettings>('load_settings')
}

export async function saveStoredSettings(settings: SavedSettings): Promise<GlobalSettings> {
  if (!isTauriRuntime()) {
    Object.assign(browserSettings, settings)
    return { ...browserSettings }
  }
  return invoke<GlobalSettings>('save_settings', { settings })
}

export async function saveStoredApiKey(value: string): Promise<GlobalSettings> {
  if (!isTauriRuntime()) {
    browserSettings.apiKeyPresent = value.length > 0
    return { ...browserSettings }
  }
  return invoke<GlobalSettings>('save_api_key', { value })
}

export async function clearStoredApiKey(): Promise<GlobalSettings> {
  if (!isTauriRuntime()) {
    browserSettings.apiKeyPresent = false
    return { ...browserSettings }
  }
  return invoke<GlobalSettings>('clear_api_key')
}
