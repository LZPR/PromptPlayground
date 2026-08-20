import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { appendMessage, createSession, editMessage } from '@/domain'
import type { MessageRepository, SessionRepository } from '@/repositories'
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
