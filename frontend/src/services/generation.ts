import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { GenerationRequestMessage } from '@/domain'

export interface StartGenerationRequest {
  readonly sessionId: string
  readonly messageId: string
  readonly messages: readonly GenerationRequestMessage[]
}

export interface GenerationEvent {
  readonly requestId: string
  readonly sessionId: string
  readonly messageId: string
  readonly text?: string
  readonly statusCode?: number | null
  readonly error?: string
}

export interface GenerationSubscription {
  readonly delta: (event: GenerationEvent) => void
  readonly completed: (event: GenerationEvent) => void
  readonly failed: (event: GenerationEvent) => void
  readonly cancelled: (event: GenerationEvent) => void
}

export interface GenerationClient {
  start(request: StartGenerationRequest, subscription: GenerationSubscription): Promise<string>
  cancel(requestId: string): Promise<void>
}

export function createGenerationClient(): GenerationClient {
  return isTauriRuntime() ? new TauriGenerationClient() : new BrowserGenerationClient()
}

export function validateGenerationConfiguration(settings: {
  readonly baseUrl: string
  readonly model: string
  readonly apiKeyPresent: boolean
}): string | null {
  if (settings.baseUrl.trim().length === 0) return '请先设置 Base URL'
  if (settings.model.trim().length === 0) return '请先设置模型名'
  if (!settings.apiKeyPresent) return '请先保存 API Key'
  return null
}

class TauriGenerationClient implements GenerationClient {
  private readonly unlistenByRequest = new Map<string, readonly UnlistenFn[]>()

  async start(request: StartGenerationRequest, subscription: GenerationSubscription): Promise<string> {
    const listeners = await Promise.all([
      listen<GenerationEvent>('generation:delta', (event) => subscription.delta(event.payload)),
      listen<GenerationEvent>('generation:completed', (event) => subscription.completed(event.payload)),
      listen<GenerationEvent>('generation:failed', (event) => subscription.failed(event.payload)),
      listen<GenerationEvent>('generation:cancelled', (event) => subscription.cancelled(event.payload))
    ])
    try {
      const response = await invoke<{ requestId: string }>('start_generation', { request })
      this.unlistenByRequest.set(response.requestId, listeners)
      return response.requestId
    } catch (error) {
      listeners.forEach((unlisten) => unlisten())
      throw error
    }
  }

  async cancel(requestId: string): Promise<void> {
    await invoke('cancel_generation', { requestId })
  }

  dispose(requestId: string): void {
    const listeners = this.unlistenByRequest.get(requestId)
    listeners?.forEach((unlisten) => unlisten())
    this.unlistenByRequest.delete(requestId)
  }
}

class BrowserGenerationClient implements GenerationClient {
  private readonly timers = new Map<string, number>()
  private readonly subscriptions = new Map<string, GenerationSubscription>()

  async start(request: StartGenerationRequest, subscription: GenerationSubscription): Promise<string> {
    const requestId = crypto.randomUUID()
    this.subscriptions.set(requestId, subscription)
    const text = '浏览器预览响应。'
    this.timers.set(requestId, window.setTimeout(() => {
      if (!this.subscriptions.has(requestId)) return
      subscription.delta({ requestId, sessionId: request.sessionId, messageId: request.messageId, text })
      subscription.completed({ requestId, sessionId: request.sessionId, messageId: request.messageId })
      this.subscriptions.delete(requestId)
      this.timers.delete(requestId)
    }, 80))
    return requestId
  }

  async cancel(requestId: string): Promise<void> {
    const timer = this.timers.get(requestId)
    if (timer !== undefined) window.clearTimeout(timer)
    const subscription = this.subscriptions.get(requestId)
    if (subscription !== undefined) {
      subscription.cancelled({ requestId, sessionId: '', messageId: '' })
    }
    this.timers.delete(requestId)
    this.subscriptions.delete(requestId)
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
