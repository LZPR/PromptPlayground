import { describe, expect, it } from 'vitest'
import { appendMessage, createSession, renameSession } from '@/domain'
import { SqliteSessionRepository } from './sqlite-session-repository'
import type { SqlClient } from './sqlite-session-repository'

class FakeSqlClient implements SqlClient {
  readonly executions: Array<{ query: string; values: readonly unknown[] }> = []

  constructor(private selections: unknown[][] = []) {}

  async execute(
    query: string,
    bindValues: readonly unknown[] = []
  ): Promise<void> {
    this.executions.push({ query, values: bindValues })
  }

  async select<T>(): Promise<T> {
    return (this.selections.shift() ?? []) as T
  }
}

const createdAt = '2026-08-20T00:00:00.000Z'

describe('[session repository] load [maps persisted nodes into a current path]', () => {
  it('restores root, message order, and current leaf', async () => {
    const client = new FakeSqlClient([
      [
        {
          id: 'session-1',
          title: 'Hello',
          title_initialized: 1,
          root_id: 'root-1',
          current_leaf_id: 'user-1',
          created_at: createdAt,
          updated_at: '2026-08-20T00:02:00.000Z'
        }
      ],
      [
        {
          id: 'root-1',
          session_id: 'session-1',
          parent_id: null,
          node_type: 'root',
          role: null,
          text: null,
          status: null,
          created_order: null,
          created_at: createdAt,
          updated_at: createdAt
        },
        {
          id: 'system-1',
          session_id: 'session-1',
          parent_id: 'root-1',
          node_type: 'message',
          role: 'system',
          text: 'System',
          status: 'normal',
          created_order: 1,
          created_at: createdAt,
          updated_at: createdAt
        },
        {
          id: 'user-1',
          session_id: 'session-1',
          parent_id: 'system-1',
          node_type: 'message',
          role: 'user',
          text: 'Hello',
          status: 'normal',
          created_order: 2,
          created_at: '2026-08-20T00:01:00.000Z',
          updated_at: '2026-08-20T00:01:00.000Z'
        }
      ]
    ])

    const [session] = await new SqliteSessionRepository(client).loadAll()

    expect(session.currentLeafId).toBe('user-1')
    expect(session.nodes['root-1']).toMatchObject({ childIds: ['system-1'] })
    expect(session.nodes['system-1']).toMatchObject({ childIds: ['user-1'] })
    expect(session.nodes['user-1']).toMatchObject({
      createdOrder: 2,
      text: 'Hello'
    })
  })
})

describe('[session repository] persist [uses parameterized statements]', () => {
  it('persists an empty session and its virtual root', async () => {
    const client = new FakeSqlClient()
    const session = createSession({
      id: 'session-1',
      rootId: 'root-1',
      createdAt
    })

    await new SqliteSessionRepository(client).create(session)

    expect(client.executions).toHaveLength(2)
    expect(client.executions[0].query).toContain('INSERT INTO sessions')
    expect(client.executions[0].values).toEqual([
      'session-1',
      '新会话',
      0,
      'root-1',
      null,
      createdAt,
      createdAt
    ])
    expect(client.executions[1].query).toContain('INSERT INTO session_nodes')
    expect(client.executions[1].values).toEqual([
      'root-1',
      'session-1',
      createdAt,
      createdAt
    ])
  })

  it('persists appended message metadata, renamed titles, and deletions', async () => {
    const client = new FakeSqlClient()
    const repository = new SqliteSessionRepository(client)
    const appended = appendMessage(
      createSession({ id: 'session-1', rootId: 'root-1', createdAt }),
      {
        id: 'user-1',
        role: 'user',
        text: 'Hello',
        createdAt: '2026-08-20T00:01:00.000Z'
      }
    )
    const message = appended.nodes['user-1']
    if (message === undefined || message.kind !== 'message') {
      throw new Error('Expected test message')
    }

    await repository.appendMessage(appended, message)
    await repository.rename(
      renameSession(appended, {
        title: 'Renamed',
        updatedAt: '2026-08-20T00:02:00.000Z'
      })
    )
    await repository.delete('session-1')

    expect(client.executions[0].query).toContain('INSERT INTO session_nodes')
    expect(client.executions[0].values).toContain('user-1')
    expect(client.executions[1].query).toContain('UPDATE sessions')
    expect(client.executions[1].values).toEqual([
      'Hello',
      1,
      'user-1',
      '2026-08-20T00:01:00.000Z',
      'session-1'
    ])
    expect(client.executions[2].values).toEqual([
      'Renamed',
      1,
      'user-1',
      '2026-08-20T00:02:00.000Z',
      'session-1'
    ])
    expect(client.executions[3]).toEqual({
      query: 'DELETE FROM sessions WHERE id = $1',
      values: ['session-1']
    })
  })
})
