import Database from '@tauri-apps/plugin-sql'
import { assertSessionTree } from '@/domain'
import type { EmptyBranch, MessageNode, Session } from '@/domain'
import type { MessageRepository } from './index'
import {
  SESSION_DATABASE_URL,
  type SqlClient
} from './sqlite-session-repository'

export class SqliteMessageRepository implements MessageRepository {
  readonly repositoryType = 'message' as const
  private readonly clientPromise: Promise<SqlClient>

  constructor(client?: SqlClient) {
    this.clientPromise =
      client === undefined
        ? Database.load(SESSION_DATABASE_URL)
        : Promise.resolve(client)
  }

  async saveMutation(previous: Session, next: Session): Promise<void> {
    assertSessionTree(previous)
    assertSessionTree(next)
    if (previous.id !== next.id || previous.rootId !== next.rootId) {
      throw new Error('A message mutation must keep its session and root')
    }

    const client = await this.clientPromise
    let transactionStarted = false
    try {
      await client.execute('BEGIN IMMEDIATE')
      transactionStarted = true

      for (const message of removedMessages(previous, next)) {
        await client.execute(
          'DELETE FROM session_nodes WHERE id = $1 AND session_id = $2',
          [message.id, previous.id]
        )
      }
      for (const branch of removedEmptyBranches(previous, next)) {
        await client.execute(
          'DELETE FROM empty_branches WHERE id = $1 AND session_id = $2',
          [branch.id, previous.id]
        )
      }
      for (const message of addedMessages(previous, next)) {
        await client.execute(
          `INSERT INTO session_nodes
             (id, session_id, parent_id, node_type, role, text, status, created_order, branch_order, created_at, updated_at)
           VALUES ($1, $2, $3, 'message', $4, $5, $6, $7, $8, $9, $10)`,
          [
            message.id,
            next.id,
            message.parentId,
            message.role,
            message.text,
            message.status,
            message.createdOrder,
            message.branchOrder,
            message.createdAt,
            message.updatedAt
          ]
        )
      }
      for (const branch of addedEmptyBranches(previous, next)) {
        await client.execute(
          `INSERT INTO empty_branches
             (id, session_id, anchor_id, branch_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            branch.id,
            next.id,
            branch.anchorId,
            branch.branchOrder,
            branch.createdAt,
            branch.updatedAt
          ]
        )
      }
      await client.execute(
        `UPDATE sessions
         SET current_leaf_id = $1, current_empty_branch_id = $2, updated_at = $3
         WHERE id = $4`,
        [next.currentLeafId, next.currentEmptyBranchId, next.updatedAt, next.id]
      )
      await client.execute('COMMIT')
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.execute('ROLLBACK')
        } catch {
          // The original write error is more useful to the caller.
        }
      }
      throw error
    }
  }
}

function removedEmptyBranches(
  previous: Session,
  next: Session
): readonly EmptyBranch[] {
  return Object.values(previous.emptyBranches).filter(
    (branch) => next.emptyBranches[branch.id] === undefined
  )
}

function addedEmptyBranches(
  previous: Session,
  next: Session
): readonly EmptyBranch[] {
  return Object.values(next.emptyBranches).filter(
    (branch) => previous.emptyBranches[branch.id] === undefined
  )
}

function removedMessages(
  previous: Session,
  next: Session
): readonly MessageNode[] {
  return Object.values(previous.nodes)
    .filter(
      (node): node is MessageNode =>
        node.kind === 'message' && next.nodes[node.id] === undefined
    )
    .sort((left, right) => depth(previous, right) - depth(previous, left))
}

function addedMessages(previous: Session, next: Session): readonly MessageNode[] {
  return Object.values(next.nodes)
    .filter(
      (node): node is MessageNode =>
        node.kind === 'message' && previous.nodes[node.id] === undefined
    )
    .sort((left, right) => depth(next, left) - depth(next, right))
}

function depth(session: Session, message: MessageNode): number {
  let result = 1
  let parentId = message.parentId
  while (parentId !== session.rootId) {
    const parent = session.nodes[parentId]
    if (parent === undefined || parent.kind !== 'message') {
      throw new Error(`Message parent does not exist: ${message.id}`)
    }
    result += 1
    parentId = parent.parentId
  }
  return result
}
