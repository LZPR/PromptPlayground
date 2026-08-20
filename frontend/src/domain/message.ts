import { getCurrentPath, takeGraphemes } from './session'
import type {
  MessageNode,
  MessageRole,
  MessageStatus,
  Session,
  SessionNode,
  VirtualRootNode
} from './session'

export interface CreateMessageNodeInput {
  readonly id: string
  readonly parentId: string
  readonly role: MessageRole
  readonly text: string
  readonly createdOrder: number
  readonly createdAt: string
}

export interface AddMessageInput {
  readonly id: string
  readonly position: 'start' | 'end'
  readonly text: string
  readonly role?: MessageRole
  readonly createdAt: string
}

export interface InsertMessageInput {
  readonly id: string
  readonly targetId: string
  readonly position: 'before' | 'after'
  readonly text: string
  readonly role?: MessageRole
  readonly createdAt: string
}

export interface EditMessageInput {
  readonly targetId: string
  readonly role: MessageRole
  readonly text: string
  readonly createBranch: boolean
  /** Required when createBranch is true. */
  readonly id?: string
  readonly updatedAt: string
}

export interface MessageStatusInput {
  readonly messageId: string
  readonly updatedAt: string
}

export interface BatchMessageStatusInput {
  readonly messageIds: readonly string[]
  readonly updatedAt: string
}

export interface SwapAdjacentMessagesInput {
  readonly firstId: string
  readonly secondId: string
  readonly updatedAt: string
}

export function createMessageNode(input: CreateMessageNodeInput): MessageNode {
  return {
    kind: 'message',
    id: input.id,
    parentId: input.parentId,
    childIds: [],
    role: input.role,
    text: input.text,
    status: 'normal',
    createdOrder: input.createdOrder,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
}

export function addMessage(session: Session, input: AddMessageInput): Session {
  assertSessionTree(session)
  ensureNewMessageId(session, input.id)

  const path = getCurrentPath(session)
  const target = input.position === 'start' ? path[0] : path.at(-1)
  const role = input.role ?? (input.position === 'start' ? 'system' : 'user')

  if (target === undefined) {
    const root = requireRoot(session)
    const message = newMessage(
      session,
      input.id,
      root.id,
      role,
      input.text,
      input.createdAt
    )
    return finishWithNewMessage(
      session,
      {
        ...session.nodes,
        [root.id]: { ...root, childIds: [...root.childIds, message.id] },
        [message.id]: message
      },
      message.id,
      input.createdAt,
      message
    )
  }

  if (input.position === 'start') {
    return insertBefore(
      session,
      target,
      input.id,
      role,
      input.text,
      input.createdAt
    )
  }

  return insertAfter(
    session,
    target,
    input.id,
    role,
    input.text,
    input.createdAt
  )
}

export function insertMessage(
  session: Session,
  input: InsertMessageInput
): Session {
  assertSessionTree(session)
  ensureNewMessageId(session, input.id)
  const target = requireMessage(session, input.targetId)
  const role = input.role ?? 'system'

  return input.position === 'before'
    ? insertBefore(session, target, input.id, role, input.text, input.createdAt)
    : insertAfter(session, target, input.id, role, input.text, input.createdAt)
}

export function editMessage(
  session: Session,
  input: EditMessageInput
): Session {
  assertSessionTree(session)
  const target = requireMessage(session, input.targetId)

  if (!input.createBranch) {
    return finish(
      session,
      {
        ...session.nodes,
        [target.id]: {
          ...target,
          role: input.role,
          text: input.text,
          updatedAt: input.updatedAt
        }
      },
      session.currentLeafId,
      input.updatedAt
    )
  }

  if (input.id === undefined) {
    throw new Error('A new message ID is required when editing into a branch')
  }
  ensureNewMessageId(session, input.id)

  const parent = requireParent(session, target)
  const message = newMessage(
    session,
    input.id,
    parent.id,
    input.role,
    input.text,
    input.updatedAt
  )
  const targetIndex = parent.childIds.indexOf(target.id)

  return finishWithNewMessage(
    session,
    {
      ...session.nodes,
      [parent.id]: {
        ...parent,
        childIds: [
          ...parent.childIds.slice(0, targetIndex + 1),
          message.id,
          ...parent.childIds.slice(targetIndex + 1)
        ]
      },
      [message.id]: message
    },
    message.id,
    input.updatedAt,
    message
  )
}

export function markMessagePendingDeletion(
  session: Session,
  input: MessageStatusInput
): Session {
  return updateMessageStatus(session, input, 'pending_deletion')
}

export function restoreMessage(
  session: Session,
  input: MessageStatusInput
): Session {
  assertSessionTree(session)
  const message = requireMessage(session, input.messageId)
  if (message.status !== 'pending_deletion') {
    throw new Error(`Message is not pending deletion: ${message.id}`)
  }

  return finish(
    session,
    {
      ...session.nodes,
      [message.id]: { ...message, status: 'normal', updatedAt: input.updatedAt }
    },
    session.currentLeafId,
    input.updatedAt
  )
}

export function markMessagesPendingDeletion(
  session: Session,
  input: BatchMessageStatusInput
): Session {
  assertSessionTree(session)
  const messageIds = [...new Set(input.messageIds)]
  const messages = messageIds.map((messageId) =>
    requireMessage(session, messageId)
  )

  if (messages.length === 0) {
    return session
  }

  const nodes: Record<string, SessionNode> = { ...session.nodes }
  for (const message of messages) {
    nodes[message.id] = {
      ...message,
      status: 'pending_deletion',
      updatedAt: input.updatedAt
    }
  }
  return finish(session, nodes, session.currentLeafId, input.updatedAt)
}

export function permanentlyDeleteMessage(
  session: Session,
  input: MessageStatusInput
): Session {
  assertSessionTree(session)
  const message = requireMessage(session, input.messageId)
  const parent = requireParent(session, message)
  const targetIndex = parent.childIds.indexOf(message.id)
  const nodes: Record<string, SessionNode> = { ...session.nodes }

  nodes[parent.id] = {
    ...parent,
    childIds: [
      ...parent.childIds.slice(0, targetIndex),
      ...message.childIds,
      ...parent.childIds.slice(targetIndex + 1)
    ]
  }
  for (const childId of message.childIds) {
    const child = requireMessage(session, childId)
    nodes[child.id] = { ...child, parentId: parent.id }
  }
  delete nodes[message.id]

  const currentLeafId =
    session.currentLeafId === message.id
      ? parent.kind === 'root'
        ? null
        : parent.id
      : session.currentLeafId

  return finish(session, nodes, currentLeafId, input.updatedAt)
}

export function swapAdjacentMessages(
  session: Session,
  input: SwapAdjacentMessagesInput
): Session {
  assertSessionTree(session)
  const requestedFirst = requireMessage(session, input.firstId)
  const requestedSecond = requireMessage(session, input.secondId)
  const [first, second] = areDirectlyAdjacent(requestedFirst, requestedSecond)
    ? [requestedFirst, requestedSecond]
    : areDirectlyAdjacent(requestedSecond, requestedFirst)
      ? [requestedSecond, requestedFirst]
      : [requestedFirst, requestedSecond]

  if (
    !areDirectlyAdjacent(first, second) ||
    second.childIds.length > 1 ||
    !isSortableStatus(first.status) ||
    !isSortableStatus(second.status)
  ) {
    throw new Error(
      'Messages are not adjacent sortable nodes in one linear segment'
    )
  }

  const parent = requireParent(session, first)
  const firstIndex = parent.childIds.indexOf(first.id)
  const nodes: Record<string, SessionNode> = {
    ...session.nodes,
    [parent.id]: {
      ...parent,
      childIds: replaceAt(parent.childIds, firstIndex, second.id)
    },
    [first.id]: {
      ...first,
      parentId: second.id,
      childIds: second.childIds
    },
    [second.id]: {
      ...second,
      parentId: parent.id,
      childIds: [first.id]
    }
  }

  for (const childId of second.childIds) {
    const child = requireMessage(session, childId)
    nodes[child.id] = { ...child, parentId: first.id }
  }

  const currentLeafId =
    session.currentLeafId === second.id ? first.id : session.currentLeafId
  return finish(session, nodes, currentLeafId, input.updatedAt)
}

/** Throws when a session does not represent a rooted message tree. */
export function assertSessionTree(session: Session): void {
  const root = requireRoot(session)
  const nodes = Object.values(session.nodes)

  if (nodes.filter((node) => node.kind === 'root').length !== 1) {
    throw new Error('Session must contain exactly one virtual root')
  }

  const incomingParents = new Map<string, number>()
  for (const node of nodes) {
    if (session.nodes[node.id] !== node) {
      throw new Error(`Session node key does not match node ID: ${node.id}`)
    }
    if (new Set(node.childIds).size !== node.childIds.length) {
      throw new Error(`Node contains duplicate child IDs: ${node.id}`)
    }

    for (const childId of node.childIds) {
      const child = session.nodes[childId]
      if (child === undefined || child.kind !== 'message') {
        throw new Error(`Node contains an invalid child: ${childId}`)
      }
      if (child.parentId !== node.id) {
        throw new Error(`Child parent does not match parent node: ${childId}`)
      }
      incomingParents.set(childId, (incomingParents.get(childId) ?? 0) + 1)
    }
  }

  for (const node of nodes) {
    if (node.kind !== 'message') {
      continue
    }
    if (node.parentId === node.id) {
      throw new Error(`Message cannot be its own parent: ${node.id}`)
    }
    if (incomingParents.get(node.id) !== 1) {
      throw new Error(`Message must have exactly one parent: ${node.id}`)
    }
  }

  const visited = new Set<string>()
  const visit = (node: SessionNode) => {
    if (visited.has(node.id)) {
      throw new Error(`Session tree contains a cycle: ${node.id}`)
    }
    visited.add(node.id)
    for (const childId of node.childIds) {
      const child = session.nodes[childId]
      if (child === undefined) {
        throw new Error(`Node contains an invalid child: ${childId}`)
      }
      visit(child)
    }
  }
  visit(root)

  if (visited.size !== nodes.length) {
    throw new Error(
      'Session contains messages unreachable from the virtual root'
    )
  }
  if (session.currentLeafId === null) {
    if (nodes.length !== 1) {
      throw new Error('A non-empty session must have a current message leaf')
    }
    return
  }

  getCurrentPath(session)
}

function insertBefore(
  session: Session,
  target: MessageNode,
  id: string,
  role: MessageRole,
  text: string,
  createdAt: string
): Session {
  const parent = requireParent(session, target)
  const targetIndex = parent.childIds.indexOf(target.id)
  const message = newMessage(session, id, parent.id, role, text, createdAt)

  return finishWithNewMessage(
    session,
    {
      ...session.nodes,
      [parent.id]: {
        ...parent,
        childIds: replaceAt(parent.childIds, targetIndex, message.id)
      },
      [target.id]: { ...target, parentId: message.id },
      [message.id]: { ...message, childIds: [target.id] }
    },
    session.currentLeafId,
    createdAt,
    message
  )
}

function insertAfter(
  session: Session,
  target: MessageNode,
  id: string,
  role: MessageRole,
  text: string,
  createdAt: string
): Session {
  const message = newMessage(session, id, target.id, role, text, createdAt)
  const nodes: Record<string, SessionNode> = {
    ...session.nodes,
    [target.id]: { ...target, childIds: [message.id] },
    [message.id]: { ...message, childIds: target.childIds }
  }

  for (const childId of target.childIds) {
    const child = requireMessage(session, childId)
    nodes[child.id] = { ...child, parentId: message.id }
  }

  const currentLeafId =
    session.currentLeafId === target.id ? message.id : session.currentLeafId
  return finishWithNewMessage(session, nodes, currentLeafId, createdAt, message)
}

function updateMessageStatus(
  session: Session,
  input: MessageStatusInput,
  status: MessageStatus
): Session {
  assertSessionTree(session)
  const message = requireMessage(session, input.messageId)
  return finish(
    session,
    {
      ...session.nodes,
      [message.id]: { ...message, status, updatedAt: input.updatedAt }
    },
    session.currentLeafId,
    input.updatedAt
  )
}

function finish(
  session: Session,
  nodes: Readonly<Record<string, SessionNode>>,
  currentLeafId: string | null,
  updatedAt: string
): Session {
  const nextSession: Session = { ...session, nodes, currentLeafId, updatedAt }
  assertSessionTree(nextSession)
  return nextSession
}

function finishWithNewMessage(
  session: Session,
  nodes: Readonly<Record<string, SessionNode>>,
  currentLeafId: string | null,
  updatedAt: string,
  message: MessageNode
): Session {
  const nextSession = finish(session, nodes, currentLeafId, updatedAt)
  if (nextSession.titleInitialized || message.role === 'system') {
    return nextSession
  }

  return {
    ...nextSession,
    title: takeGraphemes(message.text, 20),
    titleInitialized: true
  }
}

function newMessage(
  session: Session,
  id: string,
  parentId: string,
  role: MessageRole,
  text: string,
  createdAt: string
): MessageNode {
  return createMessageNode({
    id,
    parentId,
    role,
    text,
    createdOrder: nextCreatedOrder(session),
    createdAt
  })
}

function ensureNewMessageId(session: Session, id: string): void {
  if (session.nodes[id] !== undefined) {
    throw new Error(`Message node already exists: ${id}`)
  }
}

function requireRoot(session: Session): VirtualRootNode {
  const root = session.nodes[session.rootId]
  if (
    root === undefined ||
    root.kind !== 'root' ||
    root.id !== session.rootId
  ) {
    throw new Error(`Session root does not exist: ${session.rootId}`)
  }
  return root
}

function requireMessage(session: Session, messageId: string): MessageNode {
  const node = session.nodes[messageId]
  if (node === undefined || node.kind !== 'message') {
    throw new Error(`Message node does not exist: ${messageId}`)
  }
  return node
}

function requireParent(session: Session, message: MessageNode): SessionNode {
  const parent = session.nodes[message.parentId]
  if (parent === undefined || !parent.childIds.includes(message.id)) {
    throw new Error(`Message parent does not exist: ${message.id}`)
  }
  return parent
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

function replaceAt(
  values: readonly string[],
  index: number,
  replacement: string
): readonly string[] {
  if (index === -1) {
    throw new Error('Target is not a direct child of its parent')
  }
  return [...values.slice(0, index), replacement, ...values.slice(index + 1)]
}

function isSortableStatus(status: MessageStatus): boolean {
  return status === 'normal' || status === 'pending_deletion'
}

function areDirectlyAdjacent(parent: MessageNode, child: MessageNode): boolean {
  return (
    parent.childIds.length === 1 &&
    parent.childIds[0] === child.id &&
    child.parentId === parent.id
  )
}
