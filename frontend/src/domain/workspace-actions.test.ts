import { describe, expect, it } from 'vitest'
import {
  appendMessage,
  cloneSession,
  createEmptyBranch,
  createSession,
  getCurrentPath
} from './index'

const createdAt = '2026-08-21T00:00:00.000Z'

describe('[workspace] clone and empty branch [preserve independent navigation state]', () => {
  it('creates an empty successor branch and selects it', () => {
    const source = appendMessage(createSession({ id: 's-1', rootId: 'r-1', createdAt }), {
      id: 'u-1', role: 'user', text: 'Question', createdAt
    })
    const next = createEmptyBranch(source, { id: 'empty-1', anchorId: 'u-1', updatedAt: createdAt })

    expect(next.currentLeafId).toBeNull()
    expect(next.currentEmptyBranchId).toBe('empty-1')
    expect(getCurrentPath(next).map((message) => message.id)).toEqual(['u-1'])
  })

  it('clones a complete tree with fresh node IDs', () => {
    const source = appendMessage(createSession({ id: 's-1', rootId: 'r-1', createdAt }), {
      id: 'u-1', role: 'user', text: 'Question', createdAt
    })
    const clone = cloneSession(source, {
      id: 's-2', rootId: 'r-2', messageIds: ['u-2'], emptyBranchIds: [], mode: 'full', createdAt
    })

    expect(clone.title).toBe('Question - 副本')
    expect(clone.currentLeafId).toBe('u-2')
    expect(clone.nodes['u-2']).toMatchObject({ parentId: 'r-2', text: 'Question' })
    expect(source.nodes['u-1']).toMatchObject({ parentId: 'r-1' })
  })

  it('clones only system messages from the selected path', () => {
    const system = appendMessage(createSession({ id: 's-1', rootId: 'r-1', createdAt }), {
      id: 'system-1', role: 'system', text: 'You are concise.', createdAt
    })
    const source = appendMessage(system, { id: 'user-1', role: 'user', text: 'Question', createdAt })
    const clone = cloneSession(source, {
      id: 's-2', rootId: 'r-2', messageIds: ['system-2'], emptyBranchIds: [], mode: 'system', createdAt
    })

    expect(getCurrentPath(clone)).toMatchObject([{ role: 'system', text: 'You are concise.' }])
  })
})
