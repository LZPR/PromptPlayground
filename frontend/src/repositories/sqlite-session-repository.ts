import Database from '@tauri-apps/plugin-sql'
import { getCurrentPath } from '@/domain'
import type {
  MessageNode,
  MessageRole,
  MessageStatus,
  Session,
  SessionNode,
  VirtualRootNode
} from '@/domain'
import type { SessionRepository } from './index'

export const SESSION_DATABASE_URL = 'sqlite:prompt-playground.db'

export interface SqlClient {
  execute(query: string, bindValues?: readonly unknown[]): Promise<unknown>
  select<T>(query: string, bindValues?: readonly unknown[]): Promise<T>
}

interface SessionRow {
  id: string
  title: string
  title_initialized: number | boolean
  root_id: string
  current_leaf_id: string | null
  created_at: string
  updated_at: string
}

interface NodeRow {
  id: string
  session_id: string
  parent_id: string | null
  node_type: 'root' | 'message'
  role: MessageRole | null
  text: string | null
  status: MessageStatus | null
  created_order: number | null
  created_at: string
  updated_at: string
}

export class SqliteSessionRepository implements SessionRepository {
  readonly repositoryType = 'session' as const
  private readonly clientPromise: Promise<SqlClient>

  constructor(client?: SqlClient) {
    this.clientPromise =
      client === undefined
        ? Database.load(SESSION_DATABASE_URL)
        : Promise.resolve(client)
  }

  async loadAll(): Promise<readonly Session[]> {
    const client = await this.clientPromise
    const [sessionRows, nodeRows] = await Promise.all([
      client.select<SessionRow[]>(
        `SELECT id, title, title_initialized, root_id, current_leaf_id, created_at, updated_at
         FROM sessions
         ORDER BY updated_at DESC, id ASC`
      ),
      client.select<NodeRow[]>(
        `SELECT id, session_id, parent_id, node_type, role, text, status, created_order, created_at, updated_at
         FROM session_nodes
         ORDER BY session_id ASC, created_order ASC, id ASC`
      )
    ])

    return sessionRows.map((row) =>
      mapSession(
        row,
        nodeRows.filter((node) => node.session_id === row.id)
      )
    )
  }

  async create(session: Session): Promise<void> {
    const client = await this.clientPromise
    const root = getRoot(session)

    await client.execute(
      `INSERT INTO sessions (id, title, title_initialized, root_id, current_leaf_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.title,
        session.titleInitialized ? 1 : 0,
        session.rootId,
        session.currentLeafId,
        session.createdAt,
        session.updatedAt
      ]
    )
    await client.execute(
      `INSERT INTO session_nodes
         (id, session_id, parent_id, node_type, role, text, status, created_order, created_at, updated_at)
       VALUES ($1, $2, NULL, 'root', NULL, NULL, NULL, NULL, $3, $4)`,
      [root.id, session.id, session.createdAt, session.updatedAt]
    )
  }

  async appendMessage(session: Session, message: MessageNode): Promise<void> {
    const client = await this.clientPromise

    await client.execute(
      `INSERT INTO session_nodes
         (id, session_id, parent_id, node_type, role, text, status, created_order, created_at, updated_at)
       VALUES ($1, $2, $3, 'message', $4, $5, $6, $7, $8, $9)`,
      [
        message.id,
        session.id,
        message.parentId,
        message.role,
        message.text,
        message.status,
        message.createdOrder,
        message.createdAt,
        message.updatedAt
      ]
    )
    await this.saveSessionMetadata(client, session)
  }

  async rename(session: Session): Promise<void> {
    const client = await this.clientPromise
    await this.saveSessionMetadata(client, session)
  }

  async delete(sessionId: string): Promise<void> {
    const client = await this.clientPromise
    await client.execute('DELETE FROM sessions WHERE id = $1', [sessionId])
  }

  private async saveSessionMetadata(
    client: SqlClient,
    session: Session
  ): Promise<void> {
    await client.execute(
      `UPDATE sessions
       SET title = $1, title_initialized = $2, current_leaf_id = $3, updated_at = $4
       WHERE id = $5`,
      [
        session.title,
        session.titleInitialized ? 1 : 0,
        session.currentLeafId,
        session.updatedAt,
        session.id
      ]
    )
  }
}

function getRoot(session: Session): VirtualRootNode {
  const root = session.nodes[session.rootId]
  if (root === undefined || root.kind !== 'root') {
    throw new Error(`Session root does not exist: ${session.rootId}`)
  }
  return root
}

function mapSession(row: SessionRow, rows: readonly NodeRow[]): Session {
  const nodes = new Map<string, SessionNode>()

  for (const node of rows) {
    if (node.node_type === 'root') {
      nodes.set(node.id, { kind: 'root', id: node.id, childIds: [] })
      continue
    }

    if (
      node.parent_id === null ||
      node.role === null ||
      node.text === null ||
      node.status === null ||
      node.created_order === null
    ) {
      throw new Error(`Persisted message node is incomplete: ${node.id}`)
    }

    nodes.set(node.id, {
      kind: 'message',
      id: node.id,
      parentId: node.parent_id,
      childIds: [],
      role: node.role,
      text: node.text,
      status: node.status,
      createdOrder: node.created_order,
      createdAt: node.created_at,
      updatedAt: node.updated_at
    })
  }

  const root = nodes.get(row.root_id)
  if (root === undefined || root.kind !== 'root') {
    throw new Error(`Persisted root node is missing: ${row.root_id}`)
  }

  const childrenByParent = new Map<string, MessageNode[]>()
  for (const node of nodes.values()) {
    if (node.kind !== 'message') {
      continue
    }
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }

  const mappedNodes: Record<string, SessionNode> = {}
  for (const [nodeId, node] of nodes) {
    const children = (childrenByParent.get(nodeId) ?? [])
      .sort(
        (left, right) =>
          left.createdOrder - right.createdOrder ||
          left.id.localeCompare(right.id)
      )
      .map((child) => child.id)
    mappedNodes[nodeId] = { ...node, childIds: children } as SessionNode
  }

  const session: Session = {
    id: row.id,
    title: row.title,
    titleInitialized:
      row.title_initialized === true || row.title_initialized === 1,
    rootId: row.root_id,
    currentLeafId: row.current_leaf_id,
    nodes: mappedNodes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }

  getCurrentPath(session)
  return session
}
