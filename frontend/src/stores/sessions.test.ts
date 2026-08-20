import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSession } from '@/domain'
import type { SessionRepository } from '@/repositories'
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
    const repository = createRepository({
      loadAll: vi.fn().mockResolvedValue([session]),
      appendMessage: vi.fn().mockRejectedValue(new Error('write failed'))
    })
    const store = useSessionStore()
    await store.initialize(repository)

    await expect(
      store.appendMessage(repository, { role: 'user', text: 'Hello' })
    ).rejects.toThrow('write failed')

    expect(store.sessions).toEqual([session])
    expect(store.currentSessionId).toBe('session-1')
  })
})
