import { getCurrentPath, nextBranchOrder } from './session'
import type { EmptyBranch, MessageNode, Session, SessionNode } from './session'
import { assertSessionTree } from './message'

export interface SelectCurrentLeafInput {
  readonly leafId: string
  readonly updatedAt: string
}

export interface SelectCurrentEmptyBranchInput {
  readonly emptyBranchId: string
  readonly updatedAt: string
}

export interface CopyCurrentBranchInput {
  readonly ids: readonly string[]
  readonly emptyBranchId?: string
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

export type DirectBranchEntry =
  | { readonly kind: 'message'; readonly value: MessageNode }
  | { readonly kind: 'empty'; readonly value: EmptyBranch }

export interface DirectChildBranch {
  readonly entry: DirectBranchEntry
  /** Existing message-only consumers can use this when entry.kind is message. */
  readonly message?: MessageNode
  readonly index: number
  readonly total: number
}

export function selectCurrentLeaf(
  session: Session,
  input: SelectCurrentLeafInput
): Session {
  assertSessionTree(session)
  const leaf = requireMessage(session, input.leafId)
  if (leaf.childIds.length > 0) {
    throw new Error(`Current path selection must be a leaf: ${leaf.id}`)
  }
  return finish(session, session.nodes, session.emptyBranches, leaf.id, null, input.updatedAt)
}

export function selectCurrentEmptyBranch(
  session: Session,
  input: SelectCurrentEmptyBranchInput
): Session {
  assertSessionTree(session)
  requireEmptyBranch(session, input.emptyBranchId)
  return finish(
    session,
    session.nodes,
    session.emptyBranches,
    null,
    input.emptyBranchId,
    input.updatedAt
  )
}

export function getDirectChildBranches(
  session: Session,
  forkId: string
): readonly DirectChildBranch[] {
  assertSessionTree(session)
  return orderedBranchEntries(session, requireNode(session, forkId))
}

export function getCurrentBranchPath(session: Session): readonly MessageNode[] {
  assertSessionTree(session)
  if (session.currentEmptyBranchId !== null) return []
  const path = getCurrentPath(session)
  if (path.length === 0) throw new Error('Cannot copy an empty current path')
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index].childIds.length > 1) return path.slice(index + 1)
  }
  return path
}

export function copyCurrentBranch(
  session: Session,
  input: CopyCurrentBranchInput
): Session {
  assertSessionTree(session)
  if (session.currentEmptyBranchId !== null) {
    const source = requireEmptyBranch(session, session.currentEmptyBranchId)
    const id = input.emptyBranchId
    if (id === undefined) {
      throw new Error('An empty branch ID is required when copying an empty branch')
    }
    ensureNewBranchId(session, id)
    const emptyBranch: EmptyBranch = {
      id,
      anchorId: source.anchorId,
      branchOrder: nextBranchOrder(session),
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    }
    return finish(session, session.nodes, { ...session.emptyBranches, [id]: emptyBranch }, null, id, input.updatedAt)
  }

  const sourcePath = getCurrentBranchPath(session)
  if (input.ids.length !== sourcePath.length) {
    throw new Error('Copied branch IDs must match the source path length')
  }
  if (new Set(input.ids).size !== input.ids.length) throw new Error('Copied branch IDs must be unique')
  for (const id of input.ids) ensureNewBranchId(session, id)

  const firstSource = sourcePath[0]
  if (firstSource === undefined) throw new Error('Cannot copy an empty current path')
  const anchor = requireNode(session, firstSource.parentId)
  const firstId = input.ids[0]
  if (firstId === undefined) throw new Error('Copied branch requires a first node ID')

  const nodes: Record<string, SessionNode> = {
    ...session.nodes,
    [anchor.id]: { ...anchor, childIds: [...anchor.childIds, firstId] }
  }
  const firstOrder = nextCreatedOrder(session)
  const firstBranchOrder = nextBranchOrder(session)
  for (let index = 0; index < sourcePath.length; index += 1) {
    const source = sourcePath[index]
    const id = input.ids[index]
    const parentId = index === 0 ? anchor.id : input.ids[index - 1]
    if (id === undefined || parentId === undefined) {
      throw new Error('Copied branch IDs must match the source path length')
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
      branchOrder: firstBranchOrder + index,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    }
  }
  return finish(session, nodes, session.emptyBranches, input.ids.at(-1) ?? null, null, input.updatedAt)
}

export function switchDirectChildBranch(
  session: Session,
  input: SwitchDirectChildBranchInput
): Session {
  assertSessionTree(session)
  const fork = requireNode(session, input.forkId)
  const entries = orderedBranchEntries(session, fork)
  if (entries.length < 2) throw new Error(`Node is not a branch fork: ${fork.id}`)
  const currentIndex = currentBranchIndex(session, fork, entries)
  if (currentIndex === -1) throw new Error(`Fork is not on the current path: ${fork.id}`)
  const target = entries[input.direction === 'previous' ? currentIndex - 1 : currentIndex + 1]
  if (target === undefined) throw new Error(`No ${input.direction} branch exists at fork: ${fork.id}`)
  return target.entry.kind === 'message'
    ? finish(session, session.nodes, session.emptyBranches, firstLeaf(session, target.entry.value.id), null, input.updatedAt)
    : finish(session, session.nodes, session.emptyBranches, null, target.entry.value.id, input.updatedAt)
}

export function countBranchMessages(session: Session, entryId: string): number {
  assertSessionTree(session)
  return session.emptyBranches[entryId] === undefined
    ? collectSubtreeIds(session, requireMessage(session, entryId)).length
    : 0
}

export function deleteBranch(session: Session, input: DeleteBranchInput): Session {
  assertSessionTree(session)
  const emptyBranch = session.emptyBranches[input.entryId]
  if (emptyBranch !== undefined) {
    const anchor = requireNode(session, emptyBranch.anchorId)
    const target = session.currentEmptyBranchId === emptyBranch.id
      ? branchAfterDeletion(session, anchor, emptyBranch.id)
      : currentTarget(session)
    return finish(
      session,
      session.nodes,
      withoutEmptyBranches(session.emptyBranches, [emptyBranch.id]),
      target.leafId,
      target.emptyBranchId,
      input.updatedAt
    )
  }

  const entry = requireMessage(session, input.entryId)
  const parent = requireNode(session, entry.parentId)
  const deletedIds = collectSubtreeIds(session, entry)
  const deletesCurrentPath = getCurrentPath(session).some((node) => node.id === entry.id)
  const target = deletesCurrentPath
    ? branchAfterDeletion(session, parent, entry.id)
    : currentTarget(session)
  const nodes: Record<string, SessionNode> = {
    ...session.nodes,
    [parent.id]: { ...parent, childIds: parent.childIds.filter((childId) => childId !== entry.id) }
  }
  for (const id of deletedIds) delete nodes[id]
  const deletedEmptyIds = Object.values(session.emptyBranches)
    .filter((branch) => deletedIds.includes(branch.anchorId))
    .map((branch) => branch.id)
  return finish(
    session,
    nodes,
    withoutEmptyBranches(session.emptyBranches, deletedEmptyIds),
    target.leafId,
    target.emptyBranchId,
    input.updatedAt
  )
}

function currentBranchIndex(
  session: Session,
  fork: SessionNode,
  entries: readonly DirectChildBranch[]
): number {
  if (session.currentEmptyBranchId !== null) {
    return entries.findIndex(({ entry }) =>
      entry.kind === 'empty' && entry.value.id === session.currentEmptyBranchId && entry.value.anchorId === fork.id
    )
  }
  const pathIds = new Set(getCurrentPath(session).map((node) => node.id))
  return entries.findIndex(({ entry }) => entry.kind === 'message' && pathIds.has(entry.value.id))
}

interface CurrentTarget {
  readonly leafId: string | null
  readonly emptyBranchId: string | null
}

function branchAfterDeletion(session: Session, parent: SessionNode, entryId: string): CurrentTarget {
  const entries = orderedBranchEntries(session, parent)
  const entryIndex = entries.findIndex(({ entry }) => entry.value.id === entryId)
  if (entryIndex === -1) throw new Error(`Branch entry is not a direct child: ${entryId}`)
  const target = entries[entryIndex + 1] ?? entries[entryIndex - 1]
  if (target === undefined) {
    return parent.kind === 'root' ? { leafId: null, emptyBranchId: null } : { leafId: parent.id, emptyBranchId: null }
  }
  return target.entry.kind === 'message'
    ? { leafId: firstLeaf(session, target.entry.value.id), emptyBranchId: null }
    : { leafId: null, emptyBranchId: target.entry.value.id }
}

function currentTarget(session: Session): CurrentTarget {
  return { leafId: session.currentLeafId, emptyBranchId: session.currentEmptyBranchId }
}

function collectSubtreeIds(session: Session, entry: MessageNode): readonly string[] {
  const ids: string[] = []
  const visit = (node: MessageNode) => {
    ids.push(node.id)
    for (const childId of node.childIds) visit(requireMessage(session, childId))
  }
  visit(entry)
  return ids
}

function firstLeaf(session: Session, entryId: string): string {
  let node = requireMessage(session, entryId)
  while (node.childIds.length > 0) {
    const child = orderedBranchEntries(session, node).find(({ entry }) => entry.kind === 'message')?.entry
    if (child === undefined || child.kind !== 'message') throw new Error(`Branch node has no first message child: ${node.id}`)
    node = child.value
  }
  return node.id
}

function orderedBranchEntries(session: Session, parent: SessionNode): readonly DirectChildBranch[] {
  const entries: DirectBranchEntry[] = [
    ...parent.childIds.map((childId) => ({ kind: 'message' as const, value: requireMessage(session, childId) })),
    ...Object.values(session.emptyBranches)
      .filter((branch) => branch.anchorId === parent.id)
      .map((branch) => ({ kind: 'empty' as const, value: branch }))
  ]
  return entries
    .sort((left, right) => left.value.branchOrder - right.value.branchOrder || left.value.id.localeCompare(right.value.id))
    .map((entry, index, values) => ({
      entry,
      message: entry.kind === 'message' ? entry.value : undefined,
      index,
      total: values.length
    }))
}

function finish(
  session: Session,
  nodes: Readonly<Record<string, SessionNode>>,
  emptyBranches: Readonly<Record<string, EmptyBranch>>,
  currentLeafId: string | null,
  currentEmptyBranchId: string | null,
  updatedAt: string
): Session {
  const nextSession: Session = { ...session, nodes, emptyBranches, currentLeafId, currentEmptyBranchId, updatedAt }
  assertSessionTree(nextSession)
  return nextSession
}

function withoutEmptyBranches(
  emptyBranches: Readonly<Record<string, EmptyBranch>>,
  ids: readonly string[]
): Readonly<Record<string, EmptyBranch>> {
  const removed = new Set(ids)
  return Object.fromEntries(Object.entries(emptyBranches).filter(([id]) => !removed.has(id)))
}

function requireNode(session: Session, nodeId: string): SessionNode {
  const node = session.nodes[nodeId]
  if (node === undefined) throw new Error(`Session node does not exist: ${nodeId}`)
  return node
}

function requireMessage(session: Session, messageId: string): MessageNode {
  const node = requireNode(session, messageId)
  if (node.kind !== 'message') throw new Error(`Message node does not exist: ${messageId}`)
  return node
}

function requireEmptyBranch(session: Session, emptyBranchId: string): EmptyBranch {
  const branch = session.emptyBranches[emptyBranchId]
  if (branch === undefined) throw new Error(`Empty branch does not exist: ${emptyBranchId}`)
  return branch
}

function ensureNewBranchId(session: Session, id: string): void {
  if (session.nodes[id] !== undefined || session.emptyBranches[id] !== undefined) {
    throw new Error(`Branch entry already exists: ${id}`)
  }
}

function nextCreatedOrder(session: Session): number {
  return Math.max(
    0,
    ...Object.values(session.nodes)
      .filter((node): node is MessageNode => node.kind === 'message')
      .map((node) => node.createdOrder)
  ) + 1
}
