import { editMessage } from './message'
import { appendMessage, getCurrentPath } from './session'
import type { MessageNode, MessageRole, Session } from './session'

export interface GenerationStartInput {
  readonly id: string
  readonly updatedAt: string
  readonly regenerate: boolean
}

export interface StartedGeneration {
  readonly session: Session
  readonly messageId: string
}

export interface GenerationErrorRecord {
  readonly statusCode: number | null
  readonly summary: string
  readonly detail: string
}

export interface GenerationRequestMessage {
  readonly role: MessageRole
  readonly content: string
}

const ERROR_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: '请求参数无效',
  401: 'API Key 无效或缺失',
  403: '无权访问所选模型',
  404: '所选模型端点不存在',
  408: '请求超时',
  413: '请求内容过大',
  429: '请求过于频繁'
}

export function startGeneration(
  session: Session,
  input: GenerationStartInput
): StartedGeneration {
  const path = getCurrentPath(session)
  const terminal = path.at(-1)
  const base =
    input.regenerate && terminal?.role === 'assistant'
      ? editMessage(session, {
          targetId: terminal.id,
          id: input.id,
          role: 'assistant',
          text: '',
          createBranch: true,
          updatedAt: input.updatedAt
        })
      : appendMessage(session, {
          id: input.id,
          role: 'assistant',
          text: '',
          createdAt: input.updatedAt
        })
  const messageId = base.currentLeafId
  if (messageId === null) throw new Error('Generation did not create an assistant message')
  return { session: setGenerationMessage(base, messageId, 'generating', '', input.updatedAt), messageId }
}

export function appendGenerationDelta(
  session: Session,
  messageId: string,
  text: string,
  updatedAt: string
): Session {
  const message = requireAssistant(session, messageId)
  if (message.status !== 'generating') throw new Error(`Message is not generating: ${messageId}`)
  return setGenerationMessage(session, messageId, 'generating', message.text + text, updatedAt)
}

export function completeGeneration(
  session: Session,
  messageId: string,
  text: string | undefined,
  updatedAt: string
): Session {
  const message = requireAssistant(session, messageId)
  return setGenerationMessage(session, messageId, 'normal', text ?? message.text, updatedAt)
}

export function cancelGeneration(session: Session, messageId: string, updatedAt: string): Session {
  const message = requireAssistant(session, messageId)
  return setGenerationMessage(session, messageId, 'cancelled', message.text, updatedAt)
}

export function failGeneration(session: Session, messageId: string, updatedAt: string): Session {
  const message = requireAssistant(session, messageId)
  return setGenerationMessage(session, messageId, 'failed', message.text, updatedAt)
}

export function buildGenerationMessages(
  session: Session,
  generatedMessageId?: string
): readonly GenerationRequestMessage[] {
  return getCurrentPath(session)
    .filter((message) => message.status !== 'pending_deletion' && message.id !== generatedMessageId)
    .map((message) => ({ role: message.role, content: message.text }))
}

export function createGenerationError(
  statusCode: number | null,
  raw: string,
  apiKey?: string
): GenerationErrorRecord {
  const safe = sanitizeErrorText(raw, apiKey)
  const description =
    statusCode !== null && statusCode >= 500 && statusCode <= 599
      ? '模型服务暂时不可用'
      : statusCode === null
        ? undefined
        : ERROR_DESCRIPTIONS[statusCode]
  const summary = description === undefined
    ? statusCode === null ? `请求失败 - ${safe}` : `${statusCode} - ${safe}`
    : `${statusCode} - ${description}`
  return {
    statusCode,
    summary,
    detail: [statusCode === null ? '请求失败' : `错误码: ${statusCode}`, description, safe]
      .filter((part): part is string => part !== undefined && part.length > 0)
      .join('\n')
  }
}

export function sanitizeErrorText(raw: string, apiKey?: string): string {
  let safe = raw
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(["']?(?:api[_-]?key|x-api-key)["']?\s*[:=]\s*["']?)[^\s,"'};]+/gi, '$1[REDACTED]')
  if (apiKey !== undefined && apiKey.length > 0) {
    safe = safe.replaceAll(apiKey, '[REDACTED]')
  }
  return safe.trim() || '未知错误'
}

function setGenerationMessage(
  session: Session,
  messageId: string,
  status: MessageNode['status'],
  text: string,
  updatedAt: string
): Session {
  const message = requireAssistant(session, messageId)
  return {
    ...session,
    nodes: { ...session.nodes, [messageId]: { ...message, status, text, updatedAt } },
    updatedAt
  }
}

function requireAssistant(session: Session, messageId: string): MessageNode {
  const message = session.nodes[messageId]
  if (message === undefined || message.kind !== 'message' || message.role !== 'assistant') {
    throw new Error(`Assistant message does not exist: ${messageId}`)
  }
  return message
}
