import { describe, expect, it } from 'vitest'
import {
  copyCurrentBranch,
  deleteBranch,
  type MessageNode,
  type MessageRole,
  type Session
} from '@/domain'
import { SqliteMessageRepository } from './sqlite-message-repository'
import type { SqlClient } from './sqlite-session-repository'

const createdAt = '2026-08-20T00:00:00.000Z'
const changedAt = '2026-08-20T00:01:00.000Z'

class FakeSqlClient implements SqlClient {
  readonly executions: Array<{ query: string; values: readonly unknown[] }> = []

  constructor(private readonly failWhen?: (query: string) => boolean) {}

  async execute(
    query: string,
    bindValues: readonly unknown[] = []
  ): Promise<void> {
    this.executions.push({ query, values: bindValues })
    if (this.failWhen?.(query)) {
      throw new Error('write failed')
    }
  }

  async select<T>(): Promise<T> {
    return [] as T
  }
}

function node(
  id: string,
  parentId: string,
  role: MessageRole,
  createdOrder: number,
  childIds: readonly string[] = []
): MessageNode {
  return {
    kind: 'message',
    id,
    parentId,
    childIds,
    role,
    text: `${id} text`,
    status: 'normal',
    createdOrder,
    branchOrder: createdOrder,
    createdAt,
    updatedAt: createdAt
  }
}

function session(
  nodes: readonly MessageNode[],
  currentLeafId: string
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
      'root-1': { kind: 'root', id: 'root-1', childIds: ['u-1'] },
      ...Object.fromEntries(nodes.map((message) => [message.id, message]))
    },
    createdAt,
    updatedAt: createdAt
  }
}

describe('[message repository] save mutation [commits ordered tree writes]', () => {
  it('writes an empty branch copy and its current selection in one transaction', async () => {
    const previous = {
      ...session([node('u-1', 'root-1', 'user', 1)], 'u-1'),
      currentLeafId: null,
      currentEmptyBranchId: 'empty-1',
      emptyBranches: {
        'empty-1': {
          id: 'empty-1', anchorId: 'u-1', branchOrder: 2,
          createdAt, updatedAt: createdAt
        }
      }
    }
    const next = copyCurrentBranch(previous, {
      ids: [], emptyBranchId: 'empty-2', updatedAt: changedAt
    })
    const client = new FakeSqlClient()

    await new SqliteMessageRepository(client).saveMutation(previous, next)

    expect(client.executions.map(({ query }) => query)).toEqual([
      'BEGIN IMMEDIATE',
      expect.stringContaining('INSERT INTO empty_branches'),
      expect.stringContaining('UPDATE sessions'),
      'COMMIT'
    ])
    expect(client.executions[1].values).toEqual([
      'empty-2', 'session-1', 'u-1', 3, changedAt, changedAt
    ])
    expect(client.executions[2].values).toEqual([
      null, 'empty-2', changedAt, 'session-1'
    ])
  })

  it('inserts copied nodes before updating the selected leaf', async () => {
    const previous = session(
      [
        node('u-1', 'root-1', 'user', 1, ['a-1', 'a-2']),
        node('a-1', 'u-1', 'assistant', 2),
        node('a-2', 'u-1', 'assistant', 3)
      ],
      'a-1'
    )
    const next = copyCurrentBranch(previous, {
      ids: ['a-1-copy'],
      updatedAt: changedAt
    })
    const client = new FakeSqlClient()

    await new SqliteMessageRepository(client).saveMutation(previous, next)

    expect(client.executions.map((execution) => execution.query)).toEqual([
      'BEGIN IMMEDIATE',
      expect.stringContaining('INSERT INTO session_nodes'),
      expect.stringContaining('UPDATE sessions'),
      'COMMIT'
    ])
    expect(client.executions[1].values).toEqual([
      'a-1-copy',
      'session-1',
      'u-1',
      'assistant',
      'a-1 text',
      'normal',
      4,
      4,
      changedAt,
      changedAt
    ])
    expect(client.executions[2].values).toEqual([
      'a-1-copy',
      null,
      changedAt,
      'session-1'
    ])
  })

  it('deletes descendants from leaves to the branch entry', async () => {
    const previous = session(
      [
        node('u-1', 'root-1', 'user', 1, ['a-1']),
        node('a-1', 'u-1', 'assistant', 2, ['u-2']),
        node('u-2', 'a-1', 'user', 3, ['a-2']),
        node('a-2', 'u-2', 'assistant', 4)
      ],
      'a-2'
    )
    const next = deleteBranch(previous, { entryId: 'a-1', updatedAt: changedAt })
    const client = new FakeSqlClient()

    await new SqliteMessageRepository(client).saveMutation(previous, next)

    expect(client.executions.slice(1, 4).map((execution) => execution.values)).toEqual([
      ['a-2', 'session-1'],
      ['u-2', 'session-1'],
      ['a-1', 'session-1']
    ])
    expect(client.executions.at(-1)?.query).toBe('COMMIT')
  })

  it('rolls back when a mutation write fails', async () => {
    const previous = session(
      [
        node('u-1', 'root-1', 'user', 1, ['a-1']),
        node('a-1', 'u-1', 'assistant', 2)
      ],
      'a-1'
    )
    const next = copyCurrentBranch(previous, {
      ids: ['u-1-copy', 'a-1-copy'],
      updatedAt: changedAt
    })
    const client = new FakeSqlClient((query) => query.includes('INSERT INTO'))

    await expect(
      new SqliteMessageRepository(client).saveMutation(previous, next)
    ).rejects.toThrow('write failed')

    expect(client.executions.map((execution) => execution.query)).toEqual([
      'BEGIN IMMEDIATE',
      expect.stringContaining('INSERT INTO session_nodes'),
      'ROLLBACK'
    ])
  })
})
