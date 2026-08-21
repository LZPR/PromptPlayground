import { getDirectChildBranches } from './branch'
import { getCurrentPath } from './session'
import type { EmptyBranch, MessageNode, Session } from './session'

export interface BranchTreeEntry {
  readonly id: string
  readonly kind: 'root' | 'message' | 'empty'
  readonly label: string
  readonly depth: number
  readonly selected: boolean
  readonly expandable: boolean
  readonly deletable: boolean
}

/** Builds the UI projection without exposing the virtual root as a message. */
export function buildBranchTree(
  session: Session,
  expanded: ReadonlySet<string>
): readonly BranchTreeEntry[] {
  const currentPathIds = new Set(getCurrentPath(session).map((message) => message.id))
  const root = session.nodes[session.rootId]
  if (root === undefined || root.kind !== 'root') return []

  const emptyEntry = (branch: EmptyBranch, depth: number): BranchTreeEntry => ({
    id: branch.id,
    kind: 'empty',
    label: '空分支',
    depth,
    selected: session.currentEmptyBranchId === branch.id,
    expandable: false,
    deletable: true
  })

  const visitMessage = (message: MessageNode, depth: number): readonly BranchTreeEntry[] => {
    const children = getDirectChildBranches(session, message.id)
    const isBranch = children.length > 1
    const visible = message.role === 'user' || isBranch
    const childEntries = children.flatMap(({ entry }) =>
      entry.kind === 'message'
        ? visitMessage(entry.value, visible ? depth + 1 : depth)
        : [emptyEntry(entry.value, visible ? depth + 1 : depth)]
    )

    if (!visible) return childEntries

    const label = message.parentId === session.rootId && message.text.length === 0
      ? '第一条消息'
      : summaryText(message.text)
    const result: BranchTreeEntry[] = [{
      id: message.id,
      kind: 'message',
      label,
      depth,
      selected: currentPathIds.has(message.id),
      expandable: isBranch,
      deletable: true
    }]
    if (!isBranch || expanded.has(message.id)) result.push(...childEntries)
    return result
  }

  const rootChildren = getDirectChildBranches(session, root.id)
  if (rootChildren.length < 2) {
    return rootChildren.flatMap(({ entry }) =>
      entry.kind === 'message'
        ? visitMessage(entry.value, 0)
        : [emptyEntry(entry.value, 0)]
    )
  }

  const result: BranchTreeEntry[] = [{
    id: root.id,
    kind: 'root',
    label: '起始分支',
    depth: 0,
    selected: false,
    expandable: true,
    deletable: false
  }]
  if (expanded.has(root.id)) {
    result.push(...rootChildren.flatMap(({ entry }) =>
      entry.kind === 'message'
        ? visitMessage(entry.value, 1)
        : [emptyEntry(entry.value, 1)]
    ))
  }
  return result
}

function summaryText(text: string): string {
  return text.length === 0 ? '（空消息）' : Array.from(text).slice(0, 20).join('')
}
