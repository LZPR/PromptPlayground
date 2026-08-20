import { describe, expect, it } from 'vitest'
import type { MessageNode, MessageRole, MessageStatus, Session } from './session'
import { getCurrentPath } from './session'
import { assertSessionTree } from './message'
import {
  copyCurrentBranch,
  countBranchMessages,
  deleteBranch,
  getDirectChildBranches,
  selectCurrentLeaf,
  selectCurrentEmptyBranch,
  switchDirectChildBranch
} from './branch'

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
    branchOrder: createdOrder,
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
    currentEmptyBranchId: null,
    emptyBranches: {},
    nodes: {
      'root-1': { kind: 'root', id: 'root-1', childIds: rootChildren },
      ...Object.fromEntries(nodes.map((message) => [message.id, message]))
    },
    createdAt,
    updatedAt: createdAt
  }
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
      node('a-4', 'u-2', 'assistant', 7, [], 'pending_deletion')
    ],
    ['s-1'],
    'a-3'
  )
}

function siblingSession(currentLeafId = 'a-2'): Session {
  return session(
    [
      node('u-1', 'root-1', 'user', 1, ['a-1', 'a-2', 'a-3']),
      node('a-1', 'u-1', 'assistant', 2),
      node('a-2', 'u-1', 'assistant', 3),
      node('a-3', 'u-1', 'assistant', 4)
    ],
    ['u-1'],
    currentLeafId
  )
}

function ids(sessionValue: Session): readonly string[] {
  return getCurrentPath(sessionValue).map((message) => message.id)
}

describe('[branch] path selection and switching [resolve stable leaves]', () => {
  it('selects a leaf and resolves its unique root-to-leaf path', () => {
    const next = selectCurrentLeaf(nestedForkSession(), {
      leafId: 'a-4',
      updatedAt: changedAt
    })

    expect(ids(next)).toEqual(['s-1', 'u-1', 'a-1', 'u-2', 'a-4'])
    expect(next.updatedAt).toBe(changedAt)
  })

  it('orders direct child branches and switches only the fork suffix', () => {
    const source = nestedForkSession()
    const branches = getDirectChildBranches(source, 'u-1')
    const next = switchDirectChildBranch(source, {
      forkId: 'u-1',
      direction: 'next',
      updatedAt: changedAt
    })

    expect(branches.map((branch) => branch.message.id)).toEqual(['a-1', 'a-2'])
    expect(branches.map((branch) => `${branch.index + 1}/${branch.total}`)).toEqual([
      '1/2',
      '2/2'
    ])
    expect(ids(next)).toEqual(['s-1', 'u-1', 'a-2'])
    expect(next.nodes).toEqual(source.nodes)
  })

  it('uses created order even when stored child IDs are not ordered', () => {
    const source = session(
      [
        node('u-1', 'root-1', 'user', 1, ['a-2', 'a-1']),
        node('a-1', 'u-1', 'assistant', 2),
        node('a-2', 'u-1', 'assistant', 3)
      ],
      ['u-1'],
      'a-1'
    )
    const next = switchDirectChildBranch(source, {
      forkId: 'u-1',
      direction: 'next',
      updatedAt: changedAt
    })

    expect(getDirectChildBranches(source, 'u-1').map((branch) => branch.message.id)).toEqual([
      'a-1',
      'a-2'
    ])
    expect(next.currentLeafId).toBe('a-2')
  })

  it('selects the earliest descendant leaf when a switched branch contains forks', () => {
    const source = nestedForkSession()
    const onSecondBranch = switchDirectChildBranch(source, {
      forkId: 'u-1',
      direction: 'next',
      updatedAt: changedAt
    })
    const next = switchDirectChildBranch(onSecondBranch, {
      forkId: 'u-1',
      direction: 'previous',
      updatedAt: '2026-08-20T00:02:00.000Z'
    })

    expect(ids(next)).toEqual(['s-1', 'u-1', 'a-1', 'u-2', 'a-3'])
  })
})

describe('[branch] copy [creates independent latest parallel paths]', () => {
  it('copies only the suffix after the nearest fork and appends its order', () => {
    const source = nestedForkSession()
    const next = copyCurrentBranch(source, {
      ids: ['a-3-copy'],
      updatedAt: changedAt
    })

    expect(next.nodes['u-2'].childIds).toEqual(['a-3', 'a-4', 'a-3-copy'])
    expect(next.nodes['a-3-copy']).toMatchObject({
      parentId: 'u-2',
      childIds: [],
      role: 'assistant',
      text: 'a-3 text',
      status: 'normal',
      createdOrder: 8,
      createdAt: changedAt,
      updatedAt: changedAt
    })
    expect(next.currentLeafId).toBe('a-3-copy')
    expect(source).toEqual(nestedForkSession())
    expect(() => assertSessionTree(next)).not.toThrow()
  })

  it('rejects invalid copied IDs without mutating the source', () => {
    const source = nestedForkSession()

    expect(() =>
      copyCurrentBranch(source, { ids: [], updatedAt: changedAt })
    ).toThrow('Copied branch IDs must match')
    expect(() =>
      copyCurrentBranch(source, {
        ids: ['duplicate', 'duplicate'],
        updatedAt: changedAt
      })
    ).toThrow('Copied branch IDs must match')
    expect(source).toEqual(nestedForkSession())
  })
})

describe('[branch] empty branch [uses a separate selectable record]', () => {
  it('orders, selects, copies, and deletes empty branches without changing messages', () => {
    const source = {
      ...siblingSession('a-1'),
      emptyBranches: {
        'empty-1': {
          id: 'empty-1',
          anchorId: 'u-1',
          branchOrder: 3,
          createdAt,
          updatedAt: createdAt
        }
      }
    }
    const selected = selectCurrentEmptyBranch(source, {
      emptyBranchId: 'empty-1',
      updatedAt: changedAt
    })
    const copied = copyCurrentBranch(selected, {
      ids: [],
      emptyBranchId: 'empty-2',
      updatedAt: changedAt
    })
    const deleted = deleteBranch(copied, {
      entryId: 'empty-2',
      updatedAt: '2026-08-20T00:02:00.000Z'
    })

    expect(getDirectChildBranches(source, 'u-1').map(({ entry }) => entry.value.id)).toEqual([
      'a-1',
      'a-2',
      'empty-1',
      'a-3'
    ])
    expect(ids(selected)).toEqual(['u-1'])
    expect(copied.emptyBranches['empty-2']).toMatchObject({
      anchorId: 'u-1',
      branchOrder: 5
    })
    expect(deleted.emptyBranches['empty-2']).toBeUndefined()
    expect(deleted.currentLeafId).toBe('a-3')
    expect(deleted.nodes).toEqual(source.nodes)
  })
})

describe('[branch] delete [removes complete subtrees and preserves a valid path]', () => {
  it('counts pending-deletion messages and removes a complete nested subtree', () => {
    const source = nestedForkSession()
    const next = deleteBranch(source, { entryId: 'a-1', updatedAt: changedAt })

    expect(countBranchMessages(source, 'a-1')).toBe(4)
    expect(['a-1', 'u-2', 'a-3', 'a-4'].map((id) => next.nodes[id])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined
    ])
    expect(next.nodes['u-1'].childIds).toEqual(['a-2'])
    expect(ids(next)).toEqual(['s-1', 'u-1', 'a-2'])
    expect(() => assertSessionTree(next)).not.toThrow()
  })

  it('uses next sibling, previous sibling, parent path, and an empty root path', () => {
    const nextSibling = deleteBranch(siblingSession(), {
      entryId: 'a-2',
      updatedAt: changedAt
    })
    const previousSibling = deleteBranch(siblingSession('a-3'), {
      entryId: 'a-3',
      updatedAt: changedAt
    })
    const parentPath = deleteBranch(
      session(
        [node('u-1', 'root-1', 'user', 1, ['a-1']), node('a-1', 'u-1', 'assistant', 2)],
        ['u-1'],
        'a-1'
      ),
      { entryId: 'a-1', updatedAt: changedAt }
    )
    const emptyPath = deleteBranch(
      session(
        [node('s-1', 'root-1', 'system', 1, ['u-1']), node('u-1', 's-1', 'user', 2)],
        ['s-1'],
        'u-1'
      ),
      { entryId: 's-1', updatedAt: changedAt }
    )

    expect(nextSibling.currentLeafId).toBe('a-3')
    expect(previousSibling.currentLeafId).toBe('a-2')
    expect(parentPath.currentLeafId).toBe('u-1')
    expect(emptyPath.currentLeafId).toBeNull()
  })

  it('preserves the current path when deleting a non-current sibling', () => {
    const source = nestedForkSession()
    const next = deleteBranch(source, { entryId: 'a-2', updatedAt: changedAt })

    expect(ids(next)).toEqual(['s-1', 'u-1', 'a-1', 'u-2', 'a-3'])
    expect(next.nodes['u-1'].childIds).toEqual(['a-1'])
  })

  it('preserves tree invariants through copy, delete, and switch operations', () => {
    const copied = copyCurrentBranch(nestedForkSession(), {
      ids: ['a-3-copy'],
      updatedAt: changedAt
    })
    const deleted = deleteBranch(copied, {
      entryId: 'a-3-copy',
      updatedAt: '2026-08-20T00:02:00.000Z'
    })
    const switched = switchDirectChildBranch(deleted, {
      forkId: 'u-1',
      direction: 'next',
      updatedAt: '2026-08-20T00:03:00.000Z'
    })

    expect(switched.currentLeafId).toBe('a-2')
    expect(() => assertSessionTree(copied)).not.toThrow()
    expect(() => assertSessionTree(deleted)).not.toThrow()
    expect(() => assertSessionTree(switched)).not.toThrow()
  })
})
