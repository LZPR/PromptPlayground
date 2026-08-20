export const DEFAULT_SESSION_TITLE = '新会话'

export type MessageRole = 'system' | 'user' | 'assistant'
export type MessageStatus =
  'normal' | 'pending_deletion' | 'generating' | 'failed' | 'cancelled'

export interface VirtualRootNode {
  readonly kind: 'root'
  readonly id: string
  readonly childIds: readonly string[]
}

export interface MessageNode {
  readonly kind: 'message'
  readonly id: string
  readonly parentId: string
  readonly childIds: readonly string[]
  readonly role: MessageRole
  readonly text: string
  readonly status: MessageStatus
  readonly createdOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type SessionNode = VirtualRootNode | MessageNode

export interface Session {
  readonly id: string
  readonly title: string
  /** True once automatic naming ran or a user manually named the session. */
  readonly titleInitialized: boolean
  readonly rootId: string
  readonly currentLeafId: string | null
  readonly nodes: Readonly<Record<string, SessionNode>>
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateSessionInput {
  readonly id: string
  readonly rootId: string
  readonly createdAt: string
}

export interface AppendMessageInput {
  readonly id: string
  readonly role: MessageRole
  readonly text: string
  readonly createdAt: string
}

export interface RenameSessionInput {
  readonly title: string
  readonly updatedAt: string
}

export function createSession(input: CreateSessionInput): Session {
  const root: VirtualRootNode = {
    kind: 'root',
    id: input.rootId,
    childIds: []
  }

  return {
    id: input.id,
    title: DEFAULT_SESSION_TITLE,
    titleInitialized: false,
    rootId: root.id,
    currentLeafId: null,
    nodes: { [root.id]: root },
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
}

export function appendMessage(
  session: Session,
  input: AppendMessageInput
): Session {
  if (session.nodes[input.id] !== undefined) {
    throw new Error(`Message node already exists: ${input.id}`)
  }

  const parentId = session.currentLeafId ?? session.rootId
  const parent = session.nodes[parentId]

  if (parent === undefined) {
    throw new Error(`Current path parent does not exist: ${parentId}`)
  }
  if (
    session.currentLeafId !== null &&
    (parent.kind !== 'message' || parent.childIds.length > 0)
  ) {
    throw new Error(`Current leaf is not a valid message leaf: ${parentId}`)
  }

  const message: MessageNode = {
    kind: 'message',
    id: input.id,
    parentId,
    childIds: [],
    role: input.role,
    text: input.text,
    status: 'normal',
    createdOrder: nextCreatedOrder(session),
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
  const updatedParent = {
    ...parent,
    childIds: [...parent.childIds, message.id]
  } as SessionNode
  const shouldGenerateTitle =
    !session.titleInitialized && input.role !== 'system'

  return {
    ...session,
    title: shouldGenerateTitle ? takeGraphemes(input.text, 20) : session.title,
    titleInitialized: session.titleInitialized || shouldGenerateTitle,
    currentLeafId: message.id,
    nodes: {
      ...session.nodes,
      [updatedParent.id]: updatedParent,
      [message.id]: message
    },
    updatedAt: input.createdAt
  }
}

export function getCurrentPath(session: Session): readonly MessageNode[] {
  if (session.currentLeafId === null) {
    return []
  }

  if (session.currentLeafId === session.rootId) {
    throw new Error('Virtual root cannot be the current leaf')
  }

  const path: MessageNode[] = []
  const visited = new Set<string>()
  let nodeId = session.currentLeafId

  while (nodeId !== session.rootId) {
    if (visited.has(nodeId)) {
      throw new Error('Current path contains a cycle')
    }
    visited.add(nodeId)

    const node = session.nodes[nodeId]
    if (node === undefined || node.kind !== 'message') {
      throw new Error(
        `Current path contains an invalid message node: ${nodeId}`
      )
    }

    path.unshift(node)
    nodeId = node.parentId
  }

  if (path.at(-1)?.childIds.length !== 0) {
    throw new Error(`Current leaf has child nodes: ${session.currentLeafId}`)
  }

  return path
}

export function renameSession(
  session: Session,
  input: RenameSessionInput
): Session {
  return {
    ...session,
    title: input.title,
    titleInitialized: true,
    updatedAt: input.updatedAt
  }
}

export function deleteSession(
  sessions: readonly Session[],
  sessionId: string
): readonly Session[] {
  return sessions.filter((session) => session.id !== sessionId)
}

export function takeGraphemes(text: string, count: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), ({ segment }) => segment)
    .slice(0, count)
    .join('')
}

function nextCreatedOrder(session: Session): number {
  return (
    Math.max(
      0,
      ...Object.values(session.nodes)
        .filter((node): node is MessageNode => node.kind === 'message')
        .map((node) => node.createdOrder)
    ) + 1
  )
}
