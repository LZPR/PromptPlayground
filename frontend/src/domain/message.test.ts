import { describe, expect, it } from 'vitest'
import type {
  MessageNode,
  MessageRole,
  MessageStatus,
  Session
} from './session'
import { getCurrentPath } from './session'
import {
  addMessage,
  assertSessionTree,
  createMessageNode,
  editMessage,
  insertMessage,
  markMessagePendingDeletion,
  markMessagesPendingDeletion,
  permanentlyDeleteMessage,
  restoreMessage,
  swapAdjacentMessages
} from './message'

const createdAt = '2026-08-20T00:00:00.000Z'
const changedAt = '2026-08-20T00:01:00.000Z'

function node(
  id: string,
  parentId: string,
  role: MessageRole,
  createdOrder: number,
  childIds: readonly string[] = [],
  status: MessageStatus = 'normal'
): MessageNode {
  return {
    kind: 'message',
    id,
    parentId,
    childIds,
    role,
    text: `${id} text`,
    status,
    createdOrder,
    createdAt,
    updatedAt: createdAt
  }
}

function session(
  nodes: readonly MessageNode[],
  rootChildren: readonly string[],
  currentLeafId: string | null
): Session {
  return {
    id: 'session-1',
    title: '新会话',
    titleInitialized: false,
    rootId: 'root-1',
    currentLeafId,
    nodes: {
      'root-1': { kind: 'root', id: 'root-1', childIds: rootChildren },
      ...Object.fromEntries(nodes.map((message) => [message.id, message]))
    },
    createdAt,
    updatedAt: createdAt
  }
}

function emptySession(): Session {
  return session([], [], null)
}

function linearSession(): Session {
  return session(
    [
      node('s-1', 'root-1', 'system', 1, ['u-1']),
      node('u-1', 's-1', 'user', 2, ['a-1']),
      node('a-1', 'u-1', 'assistant', 3)
    ],
    ['s-1'],
    'a-1'
  )
}

function forkedSession(): Session {
  return session(
    [
      node('s-1', 'root-1', 'system', 1, ['u-1']),
      node('u-1', 's-1', 'user', 2, ['a-1', 'a-2']),
      node('a-1', 'u-1', 'assistant', 3),
      node('a-2', 'u-1', 'assistant', 4)
    ],
    ['s-1'],
    'a-1'
  )
}

function nestedForkSession(): Session {
  return session(
    [
      node('s-1', 'root-1', 'system', 1, ['u-1']),
      node('u-1', 's-1', 'user', 2, ['a-1', 'a-2']),
      node('a-1', 'u-1', 'assistant', 3, ['u-2']),
      node('a-2', 'u-1', 'assistant', 4),
      node('u-2', 'a-1', 'user', 5, ['a-3', 'a-4']),
      node('a-3', 'u-2', 'assistant', 6),
      node('a-4', 'u-2', 'assistant', 7)
    ],
    ['s-1'],
    'a-3'
  )
}

function deletedSession(): Session {
  const source = linearSession()
  return {
    ...source,
    nodes: {
      ...source.nodes,
      'u-1': { ...requireMessage(source, 'u-1'), status: 'pending_deletion' }
    }
  }
}

function requireMessage(sessionValue: Session, id: string): MessageNode {
  const value = sessionValue.nodes[id]
  if (value === undefined || value.kind !== 'message') {
    throw new Error(`Missing fixture message: ${id}`)
  }
  return value
}

function expectTree(sessionValue: Session): void {
  expect(() => assertSessionTree(sessionValue)).not.toThrow()
}

describe('[message] create [accepts fixed roles]', () => {
  it('creates system, user and assistant message nodes unchanged', () => {
    const messages = (['system', 'user', 'assistant'] as const).map((role) =>
      createMessageNode({
        id: `${role}-1`,
        parentId: 'root-1',
        role,
        text: `${role} text`,
        createdOrder: 1,
        createdAt
      })
    )

    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant'
    ])
    expect(messages.map((message) => message.text)).toEqual([
      'system text',
      'user text',
      'assistant text'
    ])
  })
})

describe('[message] add and insert [maintain current path connections]', () => {
  it('adds to an empty session as its first current-path message', () => {
    const next = addMessage(emptySession(), {
      id: 'new-1',
      position: 'end',
      text: 'First user message',
      createdAt: changedAt
    })

    expect(next.nodes['root-1'].childIds).toEqual(['new-1'])
    expect(requireMessage(next, 'new-1')).toMatchObject({
      parentId: 'root-1',
      role: 'user',
      createdOrder: 1
    })
    expect(next.title).toBe('First user message')
    expect(next.titleInitialized).toBe(true)
    expect(next.currentLeafId).toBe('new-1')
    expectTree(next)
  })

  it('adds at the beginning with the system default', () => {
    const source = linearSession()
    const next = addMessage(source, {
      id: 'new-1',
      position: 'start',
      text: 'Inserted system prompt',
      createdAt: changedAt
    })

    expect(requireMessage(next, 'new-1')).toMatchObject({
      parentId: 'root-1',
      childIds: ['s-1'],
      role: 'system',
      createdOrder: 4
    })
    expect(requireMessage(next, 's-1').parentId).toBe('new-1')
    expect(next.nodes['root-1'].childIds).toEqual(['new-1'])
    expect(getCurrentPath(next).map((message) => message.id)).toEqual([
      'new-1',
      's-1',
      'u-1',
      'a-1'
    ])
    expect(source).toEqual(linearSession())
    expectTree(next)
  })

  it('adds at the end with the user default', () => {
    const source = linearSession()
    const next = addMessage(source, {
      id: 'new-1',
      position: 'end',
      text: 'New user message',
      createdAt: changedAt
    })

    expect(requireMessage(next, 'new-1')).toMatchObject({
      parentId: 'a-1',
      childIds: [],
      role: 'user',
      createdOrder: 4
    })
    expect(requireMessage(next, 'a-1').childIds).toEqual(['new-1'])
    expect(next.currentLeafId).toBe('new-1')
    expectTree(next)
  })

  it('inserts before with the system default and preserves the linear path', () => {
    const source = linearSession()
    const next = insertMessage(source, {
      id: 'new-1',
      targetId: 'u-1',
      position: 'before',
      text: 'Context',
      createdAt: changedAt
    })

    expect(requireMessage(next, 'new-1')).toMatchObject({
      parentId: 's-1',
      childIds: ['u-1'],
      role: 'system',
      createdOrder: 4
    })
    expect(requireMessage(next, 'u-1').parentId).toBe('new-1')
    expect(getCurrentPath(next).map((message) => message.id)).toEqual([
      's-1',
      'new-1',
      'u-1',
      'a-1'
    ])
    expectTree(next)
  })

  it('inserts after a branch node before all of its direct children', () => {
    const source = forkedSession()
    const next = insertMessage(source, {
      id: 'new-1',
      targetId: 'u-1',
      position: 'after',
      text: 'Shared context',
      createdAt: changedAt
    })

    expect(requireMessage(next, 'u-1').childIds).toEqual(['new-1'])
    expect(requireMessage(next, 'new-1')).toMatchObject({
      parentId: 'u-1',
      childIds: ['a-1', 'a-2']
    })
    expect(requireMessage(next, 'a-1').parentId).toBe('new-1')
    expect(requireMessage(next, 'a-2').parentId).toBe('new-1')
    expectTree(next)
  })
})

describe('[message] edit and delete [preserve unaffected tree state]', () => {
  it('edits into a branch while preserving the original path', () => {
    const source = linearSession()
    const next = editMessage(source, {
      id: 'u-1-edited',
      targetId: 'u-1',
      role: 'system',
      text: 'Edited user prompt',
      createBranch: true,
      updatedAt: changedAt
    })

    expect(requireMessage(next, 's-1').childIds).toEqual(['u-1', 'u-1-edited'])
    expect(requireMessage(next, 'u-1').childIds).toEqual(['a-1'])
    expect(requireMessage(next, 'u-1-edited')).toMatchObject({
      parentId: 's-1',
      childIds: [],
      role: 'system',
      text: 'Edited user prompt',
      createdOrder: 4
    })
    expect(next.currentLeafId).toBe('u-1-edited')
    expect(source).toEqual(linearSession())
    expectTree(next)
  })

  it('edits in place without changing shared node identity or children', () => {
    const source = forkedSession()
    const original = requireMessage(source, 'u-1')
    const next = editMessage(source, {
      targetId: 'u-1',
      role: 'assistant',
      text: 'Changed shared node',
      createBranch: false,
      updatedAt: changedAt
    })

    expect(requireMessage(next, 'u-1')).toEqual({
      ...original,
      role: 'assistant',
      text: 'Changed shared node',
      updatedAt: changedAt
    })
    expect(requireMessage(next, 'u-1').childIds).toEqual(['a-1', 'a-2'])
    expectTree(next)
  })

  it('marks pending deletion and restores without changing tree edges', () => {
    const source = linearSession()
    const deleted = markMessagePendingDeletion(source, {
      messageId: 'u-1',
      updatedAt: changedAt
    })
    const restored = restoreMessage(deleted, {
      messageId: 'u-1',
      updatedAt: '2026-08-20T00:02:00.000Z'
    })

    expect(requireMessage(deleted, 'u-1').status).toBe('pending_deletion')
    expect(requireMessage(restored, 'u-1')).toMatchObject({
      parentId: 's-1',
      childIds: ['a-1'],
      role: 'user',
      text: 'u-1 text',
      status: 'normal'
    })
    expectTree(deleted)
    expectTree(restored)
  })

  it('permanently deletes a message and reconnects its children', () => {
    const source = linearSession()
    const next = permanentlyDeleteMessage(source, {
      messageId: 'u-1',
      updatedAt: changedAt
    })

    expect(next.nodes['u-1']).toBeUndefined()
    expect(requireMessage(next, 's-1').childIds).toEqual(['a-1'])
    expect(requireMessage(next, 'a-1').parentId).toBe('s-1')
    expect(source).toEqual(linearSession())
    expectTree(next)
  })

  it('permanently deletes the first real message while preserving the root', () => {
    const next = permanentlyDeleteMessage(linearSession(), {
      messageId: 's-1',
      updatedAt: changedAt
    })

    expect(next.nodes['root-1']).toEqual({
      kind: 'root',
      id: 'root-1',
      childIds: ['u-1']
    })
    expect(requireMessage(next, 'u-1').parentId).toBe('root-1')
    expectTree(next)
  })

  it('batch deletes selected messages from multiple branches without removing them', () => {
    const source = forkedSession()
    const next = markMessagesPendingDeletion(source, {
      messageIds: ['u-1', 'a-1', 'a-2'],
      updatedAt: changedAt
    })

    expect(
      ['u-1', 'a-1', 'a-2'].map((id) => requireMessage(next, id).status)
    ).toEqual(['pending_deletion', 'pending_deletion', 'pending_deletion'])
    expect(requireMessage(next, 'u-1').childIds).toEqual(['a-1', 'a-2'])
    expect(Object.keys(next.nodes)).toHaveLength(5)
    expectTree(next)
  })
})

describe('[message] sort [only exchanges adjacent linear messages]', () => {
  it('swaps adjacent messages in a linear segment', () => {
    const source = linearSession()
    const next = swapAdjacentMessages(source, {
      firstId: 'u-1',
      secondId: 'a-1',
      updatedAt: changedAt
    })

    expect(getCurrentPath(next).map((message) => message.id)).toEqual([
      's-1',
      'a-1',
      'u-1'
    ])
    expect(requireMessage(next, 's-1').childIds).toEqual(['a-1'])
    expect(requireMessage(next, 'a-1').parentId).toBe('s-1')
    expect(requireMessage(next, 'u-1')).toMatchObject({
      parentId: 'a-1',
      childIds: [],
      role: 'user',
      status: 'normal',
      createdOrder: 2
    })
    expect(next.currentLeafId).toBe('u-1')
    expectTree(next)
  })

  it('swaps a pending-deletion message in a linear segment', () => {
    const next = swapAdjacentMessages(deletedSession(), {
      firstId: 'u-1',
      secondId: 'a-1',
      updatedAt: changedAt
    })

    expect(requireMessage(next, 'u-1').status).toBe('pending_deletion')
    expect(getCurrentPath(next).map((message) => message.id)).toEqual([
      's-1',
      'a-1',
      'u-1'
    ])
    expectTree(next)
  })

  it('rejects crossing a branch, dragging a branch node, and non-adjacent nodes', () => {
    const forked = forkedSession()
    const nested = nestedForkSession()

    expect(() =>
      swapAdjacentMessages(forked, {
        firstId: 'u-1',
        secondId: 'a-1',
        updatedAt: changedAt
      })
    ).toThrow('Messages are not adjacent sortable nodes in one linear segment')
    expect(() =>
      swapAdjacentMessages(nested, {
        firstId: 'u-2',
        secondId: 'a-3',
        updatedAt: changedAt
      })
    ).toThrow('Messages are not adjacent sortable nodes in one linear segment')
    expect(() =>
      swapAdjacentMessages(linearSession(), {
        firstId: 's-1',
        secondId: 'a-1',
        updatedAt: changedAt
      })
    ).toThrow('Messages are not adjacent sortable nodes in one linear segment')

    expect(forked).toEqual(forkedSession())
    expect(nested).toEqual(nestedForkSession())
    expectTree(forked)
    expectTree(nested)
  })
})
