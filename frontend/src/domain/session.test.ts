import { describe, expect, it } from 'vitest'
import {
  appendMessage,
  createSession,
  DEFAULT_SESSION_TITLE,
  deleteSession,
  getCurrentPath,
  renameSession
} from './session'

const createdAt = '2026-08-20T00:00:00.000Z'

function emptySession() {
  return createSession({ id: 'session-1', rootId: 'root-1', createdAt })
}

describe('[session] create [contains only a virtual root and default title]', () => {
  it('creates an empty session without a visible path', () => {
    const session = emptySession()

    expect(session.title).toBe(DEFAULT_SESSION_TITLE)
    expect(session.titleInitialized).toBe(false)
    expect(session.currentLeafId).toBeNull()
    expect(session.nodes).toEqual({
      'root-1': { kind: 'root', id: 'root-1', childIds: [] }
    })
    expect(getCurrentPath(session)).toEqual([])
  })
})

describe('[session] append [maintains the current root-to-leaf path]', () => {
  it('adds messages after the current leaf with a stable order', () => {
    const session = emptySession()
    const withSystem = appendMessage(session, {
      id: 'system-1',
      role: 'system',
      text: 'System prompt',
      createdAt: '2026-08-20T00:01:00.000Z'
    })
    const withUser = appendMessage(withSystem, {
      id: 'user-1',
      role: 'user',
      text: 'Hello',
      createdAt: '2026-08-20T00:02:00.000Z'
    })

    expect(session).toEqual(emptySession())
    expect(withUser.nodes['system-1']).toMatchObject({
      parentId: 'root-1',
      createdOrder: 1
    })
    expect(withUser.nodes['user-1']).toMatchObject({
      parentId: 'system-1',
      createdOrder: 2
    })
    expect(getCurrentPath(withUser).map((node) => node.id)).toEqual([
      'system-1',
      'user-1'
    ])
  })

  it('rejects a current leaf that is not a message leaf', () => {
    const session = {
      ...emptySession(),
      currentLeafId: 'root-1'
    }

    expect(() => getCurrentPath(session)).toThrow(
      'Virtual root cannot be the current leaf'
    )
  })

  it('materializes the selected empty branch with its stable branch order', () => {
    const source = appendMessage(emptySession(), {
      id: 'user-1',
      role: 'user',
      text: 'Anchor',
      createdAt
    })
    const withEmptyBranch = {
      ...source,
      currentLeafId: null,
      currentEmptyBranchId: 'empty-1',
      emptyBranches: {
        'empty-1': {
          id: 'empty-1',
          anchorId: 'user-1',
          branchOrder: 8,
          createdAt,
          updatedAt: createdAt
        }
      }
    }

    const next = appendMessage(withEmptyBranch, {
      id: 'user-2',
      role: 'user',
      text: 'Materialized',
      createdAt: '2026-08-20T00:01:00.000Z'
    })

    expect(next.nodes['user-2']).toMatchObject({
      parentId: 'user-1',
      branchOrder: 8
    })
    expect(next.emptyBranches).toEqual({})
    expect(next.currentLeafId).toBe('user-2')
    expect(next.currentEmptyBranchId).toBeNull()
  })
})

describe('[session] automatic title [runs once for the first non-system message]', () => {
  it('ignores system messages and preserves the first generated title', () => {
    const withSystem = appendMessage(emptySession(), {
      id: 'system-1',
      role: 'system',
      text: 'System prompt',
      createdAt
    })
    const withUser = appendMessage(withSystem, {
      id: 'user-1',
      role: 'user',
      text: 'First message',
      createdAt
    })
    const withAssistant = appendMessage(withUser, {
      id: 'assistant-1',
      role: 'assistant',
      text: 'A different title',
      createdAt
    })

    expect(withSystem.title).toBe(DEFAULT_SESSION_TITLE)
    expect(withUser.title).toBe('First message')
    expect(withUser.titleInitialized).toBe(true)
    expect(withAssistant.title).toBe('First message')
  })

  it('does not split a user-perceived character cluster', () => {
    const session = appendMessage(emptySession(), {
      id: 'user-1',
      role: 'user',
      text: '1234567890123456789👨‍👩‍👧‍👦suffix',
      createdAt
    })

    expect(session.title).toBe('1234567890123456789👨‍👩‍👧‍👦')
  })
})

describe('[session] rename [prevents later automatic naming]', () => {
  it('keeps the custom title after later messages', () => {
    const renamed = renameSession(emptySession(), {
      title: 'Custom title',
      updatedAt: '2026-08-20T00:03:00.000Z'
    })
    const withUser = appendMessage(renamed, {
      id: 'user-1',
      role: 'user',
      text: 'Generated title must not replace this',
      createdAt: '2026-08-20T00:04:00.000Z'
    })

    expect(withUser.title).toBe('Custom title')
    expect(withUser.titleInitialized).toBe(true)
  })
})

describe('[session] delete [returns an independent collection without the session]', () => {
  it('does not mutate unrelated sessions', () => {
    const first = emptySession()
    const second = createSession({
      id: 'session-2',
      rootId: 'root-2',
      createdAt
    })

    expect(deleteSession([first, second], 'session-1')).toEqual([second])
    expect(first.id).toBe('session-1')
  })
})
