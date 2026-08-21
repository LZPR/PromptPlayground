import { defineStore } from 'pinia'
import {
  appendMessage as appendMessageToSession,
  appendGenerationDelta,
  buildGenerationMessages,
  cancelGeneration as cancelGenerationInSession,
  completeGeneration,
  copyCurrentBranch as copyCurrentSessionBranch,
  createGenerationError,
  createSession as createSessionModel,
  deleteBranch as deleteSessionBranch,
  deleteSession,
  failGeneration,
  getCurrentBranchPath,
  renameSession,
  selectCurrentLeaf as selectSessionCurrentLeaf,
  selectCurrentEmptyBranch as selectSessionCurrentEmptyBranch,
  startGeneration,
  switchDirectChildBranch as switchSessionDirectChildBranch
} from '@/domain'
import type { GenerationErrorRecord, GlobalSettings, MessageRole, Session } from '@/domain'
import type { MessageRepository, SessionRepository } from '@/repositories'
import {
  validateGenerationConfiguration,
  type GenerationClient,
  type GenerationEvent
} from '@/services/generation'

const generationEventQueues = new Map<string, Promise<void>>()

export interface AppendSessionMessageInput {
  readonly role: MessageRole
  readonly text: string
}

interface ActiveGeneration {
  readonly requestId: string | null
  readonly messageId: string
}

export const useSessionStore = defineStore('sessions', {
  state: () => ({
    sessions: [] as readonly Session[],
    currentSessionId: null as string | null,
    initialized: false,
    activeGenerations: {} as Readonly<Record<string, ActiveGeneration>>,
    generationErrors: {} as Readonly<Record<string, GenerationErrorRecord>>
  }),
  getters: {
    currentSession: (state): Session | null =>
      state.sessions.find((session) => session.id === state.currentSessionId) ??
      null
  },
  actions: {
    async initialize(repository: SessionRepository) {
      const sessions = await repository.loadAll()
      this.sessions = sessions
      this.currentSessionId = sessions[0]?.id ?? null
      this.initialized = true
    },

    async createSession(repository: SessionRepository) {
      const now = new Date().toISOString()
      const session = createSessionModel({
        id: crypto.randomUUID(),
        rootId: crypto.randomUUID(),
        createdAt: now
      })

      await repository.create(session)
      this.sessions = [session, ...this.sessions]
      this.currentSessionId = session.id
      return session
    },

    async appendMessage(
      repository: MessageRepository,
      input: AppendSessionMessageInput
    ) {
      const session = this.requireCurrentSession()
      const nextSession = appendMessageToSession(session, {
        id: crypto.randomUUID(),
        role: input.role,
        text: input.text,
        createdAt: new Date().toISOString()
      })
      const messageId = nextSession.currentLeafId
      const message =
        messageId === null ? undefined : nextSession.nodes[messageId]

      if (message === undefined || message.kind !== 'message') {
        throw new Error('Appended message is missing from the session')
      }

      await repository.saveMutation(session, nextSession)
      this.replaceSession(nextSession)
      this.clearGenerationError(session.id)
      return nextSession
    },

    async renameSession(repository: SessionRepository, title: string) {
      const session = this.requireCurrentSession()
      const nextSession = renameSession(session, {
        title,
        updatedAt: new Date().toISOString()
      })

      await repository.rename(nextSession)
      this.replaceSession(nextSession)
      return nextSession
    },

    async selectCurrentLeaf(repository: MessageRepository, leafId: string) {
      const session = this.requireCurrentSession()
      const nextSession = selectSessionCurrentLeaf(session, {
        leafId,
        updatedAt: new Date().toISOString()
      })

      await repository.saveMutation(session, nextSession)
      this.replaceSession(nextSession)
      return nextSession
    },

    async selectCurrentEmptyBranch(
      repository: MessageRepository,
      emptyBranchId: string
    ) {
      const session = this.requireCurrentSession()
      const nextSession = selectSessionCurrentEmptyBranch(session, {
        emptyBranchId,
        updatedAt: new Date().toISOString()
      })

      await repository.saveMutation(session, nextSession)
      this.replaceSession(nextSession)
      return nextSession
    },

    async copyCurrentBranch(repository: MessageRepository) {
      const session = this.requireCurrentSession()
      const sourcePath = getCurrentBranchPath(session)
      const nextSession = copyCurrentSessionBranch(session, {
        ids: sourcePath.map(() => crypto.randomUUID()),
        emptyBranchId:
          session.currentEmptyBranchId === null
            ? undefined
            : crypto.randomUUID(),
        updatedAt: new Date().toISOString()
      })

      await repository.saveMutation(session, nextSession)
      this.replaceSession(nextSession)
      return nextSession
    },

    async switchDirectChildBranch(
      repository: MessageRepository,
      forkId: string,
      direction: 'previous' | 'next'
    ) {
      const session = this.requireCurrentSession()
      const nextSession = switchSessionDirectChildBranch(session, {
        forkId,
        direction,
        updatedAt: new Date().toISOString()
      })

      await repository.saveMutation(session, nextSession)
      this.replaceSession(nextSession)
      return nextSession
    },

    async deleteBranch(repository: MessageRepository, entryId: string) {
      const session = this.requireCurrentSession()
      const nextSession = deleteSessionBranch(session, {
        entryId,
        updatedAt: new Date().toISOString()
      })

      await repository.saveMutation(session, nextSession)
      this.replaceSession(nextSession)
      return nextSession
    },

    async deleteSession(repository: SessionRepository, sessionId: string) {
      await repository.delete(sessionId)
      const sessions = deleteSession(this.sessions, sessionId)
      this.sessions = sessions
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = sessions[0]?.id ?? null
      }
    },

    isGenerating(sessionId: string): boolean {
      return this.activeGenerations[sessionId] !== undefined
    },

    async send(
      repository: MessageRepository,
      client: GenerationClient,
      settings: GlobalSettings,
      text: string
    ) {
      const configurationError = validateGenerationConfiguration(settings)
      if (configurationError !== null) throw new Error(configurationError)
      if (text.trim().length === 0) throw new Error('请输入要发送的内容')
      const session = this.requireCurrentSession()
      if (this.isGenerating(session.id)) throw new Error('该会话正在生成')
      const userSession = appendMessageToSession(session, {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        createdAt: new Date().toISOString()
      })
      await repository.saveMutation(session, userSession)
      this.replaceSession(userSession)
      this.clearGenerationError(session.id)
      return this.beginGeneration(repository, client, settings, false)
    },

    async regenerate(
      repository: MessageRepository,
      client: GenerationClient,
      settings: GlobalSettings
    ) {
      const configurationError = validateGenerationConfiguration(settings)
      if (configurationError !== null) throw new Error(configurationError)
      return this.beginGeneration(repository, client, settings, true)
    },

    async continueGeneration(
      repository: MessageRepository,
      client: GenerationClient,
      settings: GlobalSettings
    ) {
      const configurationError = validateGenerationConfiguration(settings)
      if (configurationError !== null) throw new Error(configurationError)
      return this.beginGeneration(repository, client, settings, false)
    },

    async cancelGeneration(client: GenerationClient) {
      const session = this.requireCurrentSession()
      const active = this.activeGenerations[session.id]
      if (active === undefined || active.requestId === null) return
      await client.cancel(active.requestId)
    },

    async beginGeneration(
      repository: MessageRepository,
      client: GenerationClient,
      settings: GlobalSettings,
      regenerate: boolean
    ) {
      const session = this.requireCurrentSession()
      if (this.isGenerating(session.id)) throw new Error('该会话正在生成')
      const now = new Date().toISOString()
      const started = startGeneration(session, {
        id: crypto.randomUUID(),
        updatedAt: now,
        regenerate
      })
      await repository.saveMutation(session, started.session)
      this.replaceSession(started.session)
      this.clearGenerationError(session.id)
      this.activeGenerations = {
        ...this.activeGenerations,
        [session.id]: { requestId: null, messageId: started.messageId }
      }
      try {
        const requestId = await client.start(
          {
            sessionId: session.id,
            messageId: started.messageId,
            messages: buildGenerationMessages(started.session, started.messageId)
          },
          {
            delta: (event) => void this.queueGenerationEvent(repository, session.id, 'delta', event),
            completed: (event) => void this.queueGenerationEvent(repository, session.id, 'completed', event),
            failed: (event) => void this.queueGenerationEvent(repository, session.id, 'failed', event),
            cancelled: (event) => void this.queueGenerationEvent(repository, session.id, 'cancelled', event)
          }
        )
        const active = this.activeGenerations[session.id]
        if (active !== undefined && active.messageId === started.messageId) {
          this.activeGenerations = { ...this.activeGenerations, [session.id]: { ...active, requestId } }
        }
        return started.messageId
      } catch (error) {
        await this.finishGenerationFailure(repository, session.id, started.messageId, null, error)
        throw error
      }
    },

    async processGenerationEvent(
      repository: MessageRepository,
      sessionId: string,
      kind: 'delta' | 'completed' | 'failed' | 'cancelled',
      event: GenerationEvent
    ) {
      const active = this.activeGenerations[sessionId]
      if (active === undefined || (active.requestId !== null && event.requestId !== active.requestId)) return
      const session = this.sessions.find((item) => item.id === sessionId)
      if (session === undefined) return
      const now = new Date().toISOString()
      if (kind === 'failed') {
        await this.finishGenerationFailure(repository, sessionId, active.messageId, event.statusCode ?? null, event.error ?? '请求失败')
        return
      }
      const next = kind === 'delta'
        ? appendGenerationDelta(session, active.messageId, event.text ?? '', now)
        : kind === 'completed'
          ? completeGeneration(session, active.messageId, event.text, now)
          : cancelGenerationInSession(session, active.messageId, now)
      await repository.saveMutation(session, next)
      this.replaceSession(next)
      if (kind !== 'delta') this.clearActiveGeneration(sessionId)
    },

    queueGenerationEvent(
      repository: MessageRepository,
      sessionId: string,
      kind: 'delta' | 'completed' | 'failed' | 'cancelled',
      event: GenerationEvent
    ) {
      const previous = generationEventQueues.get(sessionId) ?? Promise.resolve()
      const next = previous
        .catch(() => undefined)
        .then(() => this.processGenerationEvent(repository, sessionId, kind, event))
      generationEventQueues.set(sessionId, next)
      void next.finally(() => {
        if (generationEventQueues.get(sessionId) === next) {
          generationEventQueues.delete(sessionId)
        }
      })
      return next
    },

    async finishGenerationFailure(
      repository: MessageRepository,
      sessionId: string,
      messageId: string,
      statusCode: number | null,
      error: unknown
    ) {
      const session = this.sessions.find((item) => item.id === sessionId)
      if (session !== undefined) {
        const next = failGeneration(session, messageId, new Date().toISOString())
        await repository.saveMutation(session, next)
        this.replaceSession(next)
      }
      this.generationErrors = {
        ...this.generationErrors,
        [sessionId]: createGenerationError(statusCode, error instanceof Error ? error.message : String(error))
      }
      this.clearActiveGeneration(sessionId)
    },

    clearActiveGeneration(sessionId: string) {
      const remaining = { ...this.activeGenerations }
      delete remaining[sessionId]
      this.activeGenerations = remaining
    },

    clearGenerationError(sessionId: string) {
      const remaining = { ...this.generationErrors }
      delete remaining[sessionId]
      this.generationErrors = remaining
    },

    requireCurrentSession(): Session {
      const session = this.currentSession
      if (session === null) {
        throw new Error('No session is currently selected')
      }
      return session
    },

    replaceSession(nextSession: Session) {
      this.sessions = this.sessions.map((session) =>
        session.id === nextSession.id ? nextSession : session
      )
    }
  }
})
