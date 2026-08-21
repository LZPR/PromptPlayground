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
  /** Stable order among branch entries; independent from message creation order. */
  readonly branchOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type SessionNode = VirtualRootNode | MessageNode

export interface EmptyBranch {
  readonly id: string
  readonly anchorId: string
  readonly branchOrder: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Session {
  readonly id: string
  readonly title: string
  /** True once automatic naming ran or a user manually named the session. */
  readonly titleInitialized: boolean
  readonly rootId: string
  readonly currentLeafId: string | null
  readonly currentEmptyBranchId: string | null
  readonly emptyBranches: Readonly<Record<string, EmptyBranch>>
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

export interface CloneSessionInput {
  readonly id: string
  readonly rootId: string
  readonly messageIds: readonly string[]
  readonly emptyBranchIds: readonly string[]
  readonly mode: 'full' | 'system'
  readonly createdAt: string
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
    currentEmptyBranchId: null,
    emptyBranches: {},
    nodes: { [root.id]: root },
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
}

export function appendMessage(
  session: Session,
  input: AppendMessageInput
): Session {
  if (
    session.nodes[input.id] !== undefined ||
    session.emptyBranches[input.id] !== undefined
  ) {
    throw new Error(`Message node already exists: ${input.id}`)
  }

  const selectedEmptyBranch =
    session.currentEmptyBranchId === null
      ? undefined
      : session.emptyBranches[session.currentEmptyBranchId]
  if (session.currentEmptyBranchId !== null && selectedEmptyBranch === undefined) {
    throw new Error(
      `Current empty branch does not exist: ${session.currentEmptyBranchId}`
    )
  }
  if (selectedEmptyBranch !== undefined && session.currentLeafId !== null) {
    throw new Error('Current branch cannot select a leaf and an empty branch')
  }

  const parentId = selectedEmptyBranch?.anchorId ?? session.currentLeafId ?? session.rootId
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
    branchOrder: selectedEmptyBranch?.branchOrder ?? nextBranchOrder(session),
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
    currentEmptyBranchId: null,
    emptyBranches:
      selectedEmptyBranch === undefined
        ? session.emptyBranches
        : Object.fromEntries(
            Object.entries(session.emptyBranches).filter(
              ([id]) => id !== selectedEmptyBranch.id
            )
          ),
    nodes: {
      ...session.nodes,
      [updatedParent.id]: updatedParent,
      [message.id]: message
    },
    updatedAt: input.createdAt
  }
}

export function getCurrentPath(session: Session): readonly MessageNode[] {
  const selectedEmptyBranch =
    session.currentEmptyBranchId === null
      ? undefined
      : session.emptyBranches[session.currentEmptyBranchId]
  if (session.currentEmptyBranchId !== null && selectedEmptyBranch === undefined) {
    throw new Error(
      `Current empty branch does not exist: ${session.currentEmptyBranchId}`
    )
  }
  if (selectedEmptyBranch !== undefined && session.currentLeafId !== null) {
    throw new Error('Current branch cannot select a leaf and an empty branch')
  }
  if (session.currentLeafId === null && selectedEmptyBranch === undefined) {
    return []
  }

  const terminalId = selectedEmptyBranch?.anchorId ?? session.currentLeafId
  if (terminalId === session.rootId) {
    if (selectedEmptyBranch !== undefined) return []
    throw new Error('Virtual root cannot be the current leaf')
  }
  if (terminalId === null || terminalId === undefined) {
    throw new Error('Current branch is missing a terminal node')
  }

  const path: MessageNode[] = []
  const visited = new Set<string>()
  let nodeId = terminalId

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

  if (selectedEmptyBranch === undefined && path.at(-1)?.childIds.length !== 0) {
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

export function cloneSession(source: Session, input: CloneSessionInput): Session {
  if (input.mode === 'system') {
    const systemMessages = getCurrentPath(source).filter(
      (message) => message.role === 'system'
    )
    if (input.messageIds.length !== systemMessages.length) {
      throw new Error('System clone message IDs must match the selected messages')
    }
    const nodes: Record<string, SessionNode> = {
      [input.rootId]: { kind: 'root', id: input.rootId, childIds: [] }
    }
    let parentId = input.rootId
    for (const [index, message] of systemMessages.entries()) {
      const id = input.messageIds[index]
      if (id === undefined) throw new Error('System clone is missing a message ID')
      nodes[parentId] = {
        ...nodes[parentId],
        childIds: [id]
      } as SessionNode
      nodes[id] = {
        kind: 'message',
        id,
        parentId,
        childIds: [],
        role: 'system',
        text: message.text,
        status: 'normal',
        createdOrder: index + 1,
        branchOrder: index + 1,
        createdAt: input.createdAt,
        updatedAt: input.createdAt
      }
      parentId = id
    }
    return {
      id: input.id,
      title: `${source.title} - 副本`,
      titleInitialized: true,
      rootId: input.rootId,
      currentLeafId: systemMessages.length === 0 ? null : parentId,
      currentEmptyBranchId: null,
      emptyBranches: {},
      nodes,
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    }
  }

  const messages = Object.values(source.nodes)
    .filter((node): node is MessageNode => node.kind === 'message')
    .sort((left, right) => left.createdOrder - right.createdOrder || left.id.localeCompare(right.id))
  const emptyBranches = Object.values(source.emptyBranches)
    .sort((left, right) => left.branchOrder - right.branchOrder || left.id.localeCompare(right.id))
  if (input.messageIds.length !== messages.length || input.emptyBranchIds.length !== emptyBranches.length) {
    throw new Error('Full clone IDs must match the source tree')
  }

  const ids = new Map<string, string>([[source.rootId, input.rootId]])
  messages.forEach((message, index) => ids.set(message.id, input.messageIds[index]!))
  emptyBranches.forEach((branch, index) => ids.set(branch.id, input.emptyBranchIds[index]!))
  const nodes: Record<string, SessionNode> = {
    [input.rootId]: {
      kind: 'root',
      id: input.rootId,
      childIds: source.nodes[source.rootId]!.childIds.map((id) => ids.get(id)!)
    }
  }
  for (const message of messages) {
    const id = ids.get(message.id)!
    nodes[id] = {
      ...message,
      id,
      parentId: ids.get(message.parentId)!,
      childIds: message.childIds.map((childId) => ids.get(childId)!),
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    }
  }
  const clonedEmptyBranches = Object.fromEntries(emptyBranches.map((branch) => {
    const id = ids.get(branch.id)!
    return [id, {
      ...branch,
      id,
      anchorId: ids.get(branch.anchorId)!,
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    }]
  }))
  return {
    id: input.id,
    title: `${source.title} - 副本`,
    titleInitialized: true,
    rootId: input.rootId,
    currentLeafId: source.currentLeafId === null ? null : ids.get(source.currentLeafId)!,
    currentEmptyBranchId: source.currentEmptyBranchId === null ? null : ids.get(source.currentEmptyBranchId)!,
    emptyBranches: clonedEmptyBranches,
    nodes,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
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

export function nextBranchOrder(session: Session): number {
  return (
    Math.max(
      0,
      ...Object.values(session.nodes)
        .filter((node): node is MessageNode => node.kind === 'message')
        .map((node) => node.branchOrder),
      ...Object.values(session.emptyBranches).map((branch) => branch.branchOrder)
    ) + 1
  )
}
