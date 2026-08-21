import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { appendMessage, createSession, editMessage } from '@/domain'
import type { MessageRepository, SessionRepository } from '@/repositories'
import type { GenerationClient, GenerationSubscription, StartGenerationRequest } from '@/services/generation'
import { useSessionStore } from './sessions'

const createdAt = '2026-08-20T00:00:00.000Z'

function createRepository(
  overrides: Partial<SessionRepository> = {}
): SessionRepository {
  return {
    repositoryType: 'session',
    loadAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function createMessageRepository(
  overrides: Partial<MessageRepository> = {}
): MessageRepository {
  return {
    repositoryType: 'message',
    saveMutation: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function generationClient(): GenerationClient & {
  readonly subscription: GenerationSubscription | undefined
  readonly request: StartGenerationRequest | undefined
} {
  let subscription: GenerationSubscription | undefined
  let request: StartGenerationRequest | undefined
  return {
    get subscription() { return subscription },
    get request() { return request },
    start: vi.fn().mockImplementation(async (input: StartGenerationRequest, events: GenerationSubscription) => {
      request = input
      subscription = events
      return 'request-1'
    }),
    cancel: vi.fn().mockResolvedValue(undefined)
  }
}

const configuredSettings = {
  baseUrl: 'https://example.test/v1', apiKeyPresent: true, model: 'test-model',
  temperature: 0.7, maxOutput: 1024, stream: true, displayMode: 'markdown' as const
}

function branchSession() {
  const withUser = appendMessage(
    createSession({ id: 'session-1', rootId: 'root-1', createdAt }),
    { id: 'u-1', role: 'user', text: 'Question', createdAt }
  )
  const withAnswer = appendMessage(withUser, {
    id: 'a-1',
    role: 'assistant',
    text: 'Answer',
    createdAt: '2026-08-20T00:01:00.000Z'
  })

  return editMessage(withAnswer, {
    id: 'a-2',
    targetId: 'a-1',
    role: 'assistant',
    text: 'Alternative answer',
    createBranch: true,
    updatedAt: '2026-08-20T00:02:00.000Z'
  })
}

describe('[session store] initialize [restores sessions and current selection]', () => {
  it('selects the most recently persisted session', async () => {
    setActivePinia(createPinia())
    const first = createSession({
      id: 'session-1',
      rootId: 'root-1',
      createdAt
    })
    const second = createSession({
      id: 'session-2',
      rootId: 'root-2',
      createdAt
    })
    const repository = createRepository({
      loadAll: vi.fn().mockResolvedValue([second, first])
    })
    const store = useSessionStore()

    await store.initialize(repository)

    expect(store.sessions).toEqual([second, first])
    expect(store.currentSessionId).toBe('session-2')
    expect(store.initialized).toBe(true)
  })
})

describe('[session store] mutations [persist before updating local state]', () => {
  it('does not add a session when persistence fails', async () => {
    setActivePinia(createPinia())
    const repository = createRepository({
      create: vi.fn().mockRejectedValue(new Error('storage unavailable'))
    })
    const store = useSessionStore()

    await expect(store.createSession(repository)).rejects.toThrow(
      'storage unavailable'
    )

    expect(store.sessions).toEqual([])
    expect(store.currentSessionId).toBeNull()
  })

  it('does not update the current session when an append fails', async () => {
    setActivePinia(createPinia())
    const session = createSession({
      id: 'session-1',
      rootId: 'root-1',
      createdAt
    })
    const repository = createRepository({ loadAll: vi.fn().mockResolvedValue([session]) })
    const messageRepository = createMessageRepository({
      saveMutation: vi.fn().mockRejectedValue(new Error('write failed'))
    })
    const store = useSessionStore()
    await store.initialize(repository)

    await expect(
      store.appendMessage(messageRepository, { role: 'user', text: 'Hello' })
    ).rejects.toThrow('write failed')

    expect(store.sessions).toEqual([session])
    expect(store.currentSessionId).toBe('session-1')
  })

  it.each([
    ['select', (store: ReturnType<typeof useSessionStore>, repository: MessageRepository) => store.selectCurrentLeaf(repository, 'a-1')],
    ['copy', (store: ReturnType<typeof useSessionStore>, repository: MessageRepository) => store.copyCurrentBranch(repository)],
    ['switch', (store: ReturnType<typeof useSessionStore>, repository: MessageRepository) => store.switchDirectChildBranch(repository, 'u-1', 'previous')],
    ['delete', (store: ReturnType<typeof useSessionStore>, repository: MessageRepository) => store.deleteBranch(repository, 'a-2')]
  ])('does not update the current session when branch %s persistence fails', async (_, operation) => {
    setActivePinia(createPinia())
    const session = branchSession()
    const sessionRepository = createRepository({
      loadAll: vi.fn().mockResolvedValue([session])
    })
    const messageRepository = createMessageRepository({
      saveMutation: vi.fn().mockRejectedValue(new Error('write failed'))
    })
    const store = useSessionStore()
    await store.initialize(sessionRepository)

    await expect(operation(store, messageRepository)).rejects.toThrow(
      'write failed'
    )

    expect(store.sessions).toEqual([session])
    expect(store.currentSession).toEqual(session)
  })
})

describe('[session store] generation [persists events and isolates runtime failures]', () => {
  it('streams, completes, and clears the active request', async () => {
    setActivePinia(createPinia())
    const source = appendMessage(createSession({ id: 'session-1', rootId: 'root-1', createdAt }), { id: 'u-1', role: 'user', text: 'Question', createdAt })
    const store = useSessionStore()
    await store.initialize(createRepository({ loadAll: vi.fn().mockResolvedValue([source]) }))
    const messages = createMessageRepository()
    const client = generationClient()

    await store.regenerate(messages, client, configuredSettings)
    expect(store.isGenerating('session-1')).toBe(true)
    expect(client.request?.messages).toEqual([{ role: 'user', content: 'Question' }])
    client.subscription?.delta({ requestId: 'request-1', sessionId: 'session-1', messageId: client.request!.messageId, text: 'partial' })
    client.subscription?.completed({ requestId: 'request-1', sessionId: 'session-1', messageId: client.request!.messageId })
    await vi.waitFor(() => {
      expect(store.currentSession?.nodes[client.request!.messageId]).toMatchObject({ text: 'partial', status: 'normal' })
      expect(store.isGenerating('session-1')).toBe(false)
    })
  })

  it('marks failed output and records a temporary safe error', async () => {
    setActivePinia(createPinia())
    const source = appendMessage(createSession({ id: 'session-1', rootId: 'root-1', createdAt }), { id: 'u-1', role: 'user', text: 'Question', createdAt })
    const store = useSessionStore()
    await store.initialize(createRepository({ loadAll: vi.fn().mockResolvedValue([source]) }))
    const client = generationClient()
    await store.regenerate(createMessageRepository(), client, configuredSettings)
    client.subscription?.failed({ requestId: 'request-1', sessionId: 'session-1', messageId: client.request!.messageId, statusCode: 429, error: 'slow down' })
    await vi.waitFor(() => {
      expect(store.currentSession?.nodes[client.request!.messageId]).toMatchObject({ status: 'failed' })
      expect(store.generationErrors['session-1']?.summary).toBe('429 - 请求过于频繁')
    })
  })
})
