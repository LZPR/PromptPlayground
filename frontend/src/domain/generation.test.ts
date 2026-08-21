import { describe, expect, it } from 'vitest'
import { appendMessage, createSession, getCurrentPath } from './session'
import { appendGenerationDelta, buildGenerationMessages, cancelGeneration, completeGeneration, createGenerationError, failGeneration, startGeneration } from './generation'

const createdAt = '2026-08-21T00:00:00.000Z'
function userSession() {
  return appendMessage(createSession({ id: 'session-1', rootId: 'root-1', createdAt }), { id: 'u-1', role: 'user', text: 'Question', createdAt })
}

describe('[generation] state [creates and completes assistant messages]', () => {
  it('starts, streams, cancels, and fails without discarding text', () => {
    const started = startGeneration(userSession(), { id: 'a-1', updatedAt: createdAt, regenerate: false })
    const streamed = appendGenerationDelta(started.session, 'a-1', 'partial', createdAt)
    expect(cancelGeneration(streamed, 'a-1', createdAt).nodes['a-1']).toMatchObject({ status: 'cancelled', text: 'partial' })
    expect(failGeneration(streamed, 'a-1', createdAt).nodes['a-1']).toMatchObject({ status: 'failed', text: 'partial' })
    expect(completeGeneration(streamed, 'a-1', 'complete', createdAt).nodes['a-1']).toMatchObject({ status: 'normal', text: 'complete' })
  })

  it('regenerates an assistant as a parallel replacement path', () => {
    const original = startGeneration(userSession(), { id: 'a-1', updatedAt: createdAt, regenerate: false })
    const done = completeGeneration(original.session, 'a-1', 'Answer', createdAt)
    const replacement = startGeneration(done, { id: 'a-2', updatedAt: createdAt, regenerate: true })
    expect(done.nodes['u-1'].childIds).toEqual(['a-1'])
    expect(replacement.session.nodes['u-1'].childIds).toEqual(['a-1', 'a-2'])
    expect(getCurrentPath(replacement.session).map((message) => message.id)).toEqual(['u-1', 'a-2'])
  })

  it('filters deleted and generated messages from requests', () => {
    const started = startGeneration(userSession(), { id: 'a-1', updatedAt: createdAt, regenerate: false })
    expect(buildGenerationMessages(started.session, 'a-1')).toEqual([{ role: 'user', content: 'Question' }])
  })
})

describe('[generation error] map [uses safe diagnostics]', () => {
  it('maps known codes and removes credentials', () => {
    const error = createGenerationError(404, 'Authorization: Bearer secret-key model missing', 'secret-key')
    expect(error.summary).toBe('404 - 所选模型端点不存在')
    expect(error.detail).not.toContain('secret-key')
    expect(createGenerationError(418, 'teapot').summary).toBe('418 - teapot')
    expect(createGenerationError(null, 'offline').summary).toBe('请求失败 - offline')
  })
})
