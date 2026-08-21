import { describe, expect, it } from 'vitest'
import { buildBranchTree } from './branch-tree'
import type { MessageNode, Session } from './session'

const createdAt = '2026-08-20T00:00:00.000Z'

function message(id: string, text: string, branchOrder: number): MessageNode {
  return {
    kind: 'message',
    id,
    parentId: 'root-1',
    childIds: [],
    role: 'user',
    text,
    status: 'normal',
    createdOrder: branchOrder,
    branchOrder,
    createdAt,
    updatedAt: createdAt
  }
}

function rootForkSession(): Session {
  return {
    id: 'session-1',
    title: '新会话',
    titleInitialized: false,
    rootId: 'root-1',
    currentLeafId: 'u-2',
    currentEmptyBranchId: null,
    emptyBranches: {},
    nodes: {
      'root-1': { kind: 'root', id: 'root-1', childIds: ['u-1', 'u-2'] },
      'u-1': message('u-1', '', 1),
      'u-2': message('u-2', '第二条消息', 2)
    },
    createdAt,
    updatedAt: createdAt
  }
}

describe('[branch tree] root fork [shows an expandable virtual root]', () => {
  it('labels the root and its empty first child without exposing root deletion', () => {
    const source = rootForkSession()
    const collapsed = buildBranchTree(source, new Set())
    const expanded = buildBranchTree(source, new Set(['root-1']))

    expect(collapsed).toEqual([
      expect.objectContaining({
        id: 'root-1',
        kind: 'root',
        label: '起始分支',
        expandable: true,
        deletable: false
      })
    ])
    expect(expanded.map((entry) => [entry.id, entry.label, entry.depth])).toEqual([
      ['root-1', '起始分支', 0],
      ['u-1', '第一条消息', 1],
      ['u-2', '第二条消息', 1]
    ])
    expect(expanded.find((entry) => entry.id === 'u-2')?.selected).toBe(true)
  })
})
