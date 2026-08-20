import { getCurrentPath } from './session'
import type { MessageNode, Session, SessionNode } from './session'
import { assertSessionTree } from './message'

export interface SelectCurrentLeafInput {
  readonly leafId: string
  readonly updatedAt: string
}

export interface CopyCurrentBranchInput {
  /** One new ID for each copied source node, in path order. */
  readonly ids: readonly string[]
  readonly updatedAt: string
}

export interface SwitchDirectChildBranchInput {
  readonly forkId: string
  readonly direction: 'previous' | 'next'
  readonly updatedAt: string
}

export interface DeleteBranchInput {
  readonly entryId: string
  readonly updatedAt: string
}

export interface DirectChildBranch {
  readonly message: MessageNode
  readonly index: number
  readonly total: number
}

/** Selects a root-to-leaf path by selecting its leaf node. */
export function selectCurrentLeaf(
  session: Session,
  input: SelectCurrentLeafInput
): Session {
  assertSessionTree(session)
  const leaf = requireMessage(session, input.leafId)
  if (leaf.childIds.length > 0) {
    throw new Error(`Current path selection must be a leaf: ${leaf.id}`)
  }

  return finish(session, session.nodes, leaf.id, input.updatedAt)
}

export function getDirectChildBranches(
  session: Session,
  forkId: string
): readonly DirectChildBranch[] {
  assertSessionTree(session)
  const fork = requireNode(session, forkId)
  const childIds = orderedChildIds(session, fork)
  const total = childIds.length

  return childIds.map((childId, index) => ({
    message: requireMessage(session, childId),
    index,
    total
  }))
}

/** Returns the current path segment which becomes a copied parallel branch. */
export function getCurrentBranchPath(
  session: Session
): readonly MessageNode[] {
  assertSessionTree(session)
  const path = getCurrentPath(session)
  if (path.length === 0) {
    throw new Error('Cannot copy an empty current path')
  }

  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index].childIds.length > 1) {
      return path.slice(index + 1)
    }
  }

  return path
}

/** Copies the suffix after the nearest current-path fork into a new parallel path. */
export function copyCurrentBranch(
  session: Session,
  input: CopyCurrentBranchInput
): Session {
  assertSessionTree(session)
  const sourcePath = getCurrentBranchPath(session)
  if (input.ids.length !== sourcePath.length) {
    throw new Error('Copied branch IDs must match the source path length')
  }
  if (new Set(input.ids).size !== input.ids.length) {
    throw new Error('Copied branch IDs must be unique')
  }
  for (const id of input.ids) {
    if (session.nodes[id] !== undefined) {
      throw new Error(`Message node already exists: ${id}`)
    }
  }

  const firstSource = sourcePath[0]
  if (firstSource === undefined) {
    throw new Error('Cannot copy an empty current path')
  }
  const anchor = requireNode(session, firstSource.parentId)
  const firstId = input.ids[0]
  if (firstId === undefined) {
    throw new Error('Copied branch requires a first node ID')
  }

  const nodes: Record<string, SessionNode> = {
    ...session.nodes,
    [anchor.id]: { ...anchor, childIds: [...anchor.childIds, firstId] }
  }
  const firstOrder = nextCreatedOrder(session)

  for (let index = 0; index < sourcePath.length; index += 1) {
    const source = sourcePath[index]
    const id = input.ids[index]
    if (id === undefined) {
      throw new Error('Copied branch IDs must match the source path length')
    }
    const parentId = index === 0 ? anchor.id : input.ids[index - 1]
    if (parentId === undefined) {
      throw new Error('Copied branch is missing a parent node ID')
    }
    const childId = input.ids[index + 1]

    nodes[id] = {
      kind: 'message',
      id,
      parentId,
      childIds: childId === undefined ? [] : [childId],
      role: source.role,
      text: source.text,
      status: source.status,
      createdOrder: firstOrder + index,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    }
  }

  return finish(
    session,
    nodes,
    input.ids.at(-1) ?? null,
    input.updatedAt
  )
}

/** Switches one current-path fork to its adjacent direct child branch. */
export function switchDirectChildBranch(
  session: Session,
  input: SwitchDirectChildBranchInput
): Session {
  assertSessionTree(session)
  const fork = requireNode(session, input.forkId)
  const childIds = orderedChildIds(session, fork)
  if (childIds.length < 2) {
    throw new Error(`Node is not a branch fork: ${fork.id}`)
  }

  const currentPathIds = new Set(getCurrentPath(session).map((node) => node.id))
  const currentIndex = childIds.findIndex((childId) =>
    currentPathIds.has(childId)
  )
  if (currentIndex === -1) {
    throw new Error(`Fork is not on the current path: ${fork.id}`)
  }

  const targetIndex =
    input.direction === 'previous' ? currentIndex - 1 : currentIndex + 1
  const targetId = childIds[targetIndex]
  if (targetId === undefined) {
    throw new Error(`No ${input.direction} branch exists at fork: ${fork.id}`)
  }

  return finish(session, session.nodes, firstLeaf(session, targetId), input.updatedAt)
}

export function countBranchMessages(session: Session, entryId: string): number {
  assertSessionTree(session)
  return collectSubtreeIds(session, requireMessage(session, entryId)).length
}

/** Deletes a branch entry and its complete real-message descendant subtree. */
export function deleteBranch(
  session: Session,
  input: DeleteBranchInput
): Session {
  assertSessionTree(session)
  const entry = requireMessage(session, input.entryId)
  const parent = requireNode(session, entry.parentId)
  const deletedIds = collectSubtreeIds(session, entry)
  const currentPathIds = new Set(getCurrentPath(session).map((node) => node.id))
  const deletesCurrentPath = currentPathIds.has(entry.id)
  const entryIndex = parent.childIds.indexOf(entry.id)
  if (entryIndex === -1) {
    throw new Error(`Branch entry is not a direct child: ${entry.id}`)
  }

  const nextLeaf = deletesCurrentPath
    ? leafAfterBranchDeletion(session, parent, entry.id)
    : session.currentLeafId
  const nodes: Record<string, SessionNode> = {
    ...session.nodes,
    [parent.id]: {
      ...parent,
      childIds: parent.childIds.filter((childId) => childId !== entry.id)
    }
  }
  for (const id of deletedIds) {
    delete nodes[id]
  }

  return finish(session, nodes, nextLeaf, input.updatedAt)
}

function leafAfterBranchDeletion(
  session: Session,
  parent: SessionNode,
  entryId: string
): string | null {
  const childIds = orderedChildIds(session, parent)
  const entryIndex = childIds.indexOf(entryId)
  if (entryIndex === -1) {
    throw new Error(`Branch entry is not a direct child: ${entryId}`)
  }
  const nextId = childIds[entryIndex + 1]
  if (nextId !== undefined) {
    return firstLeaf(session, nextId)
  }
  const previousId = childIds[entryIndex - 1]
  if (previousId !== undefined) {
    return firstLeaf(session, previousId)
  }
  return parent.kind === 'root' ? null : parent.id
}

function collectSubtreeIds(
  session: Session,
  entry: MessageNode
): readonly string[] {
  const ids: string[] = []
  const visit = (node: MessageNode) => {
    ids.push(node.id)
    for (const childId of node.childIds) {
      visit(requireMessage(session, childId))
    }
  }
  visit(entry)
  return ids
}

function firstLeaf(session: Session, entryId: string): string {
  let node = requireMessage(session, entryId)
  while (node.childIds.length > 0) {
    const nextId = orderedChildIds(session, node)[0]
    if (nextId === undefined) {
      throw new Error(`Branch node has no first child: ${node.id}`)
    }
    node = requireMessage(session, nextId)
  }
  return node.id
}

function orderedChildIds(
  session: Session,
  parent: SessionNode
): readonly string[] {
  return [...parent.childIds].sort((leftId, rightId) => {
    const left = requireMessage(session, leftId)
    const right = requireMessage(session, rightId)
    return left.createdOrder - right.createdOrder || left.id.localeCompare(right.id)
  })
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

function requireNode(session: Session, nodeId: string): SessionNode {
  const node = session.nodes[nodeId]
  if (node === undefined) {
    throw new Error(`Session node does not exist: ${nodeId}`)
  }
  return node
}

function requireMessage(session: Session, messageId: string): MessageNode {
  const node = requireNode(session, messageId)
  if (node.kind !== 'message') {
    throw new Error(`Message node does not exist: ${messageId}`)
  }
  return node
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
