import { defineStore } from 'pinia'
import {
  appendMessage as appendMessageToSession,
  copyCurrentBranch as copyCurrentSessionBranch,
  createSession as createSessionModel,
  deleteBranch as deleteSessionBranch,
  deleteSession,
  getCurrentBranchPath,
  renameSession,
  selectCurrentLeaf as selectSessionCurrentLeaf,
  switchDirectChildBranch as switchSessionDirectChildBranch
} from '@/domain'
import type { MessageRole, Session } from '@/domain'
import type { MessageRepository, SessionRepository } from '@/repositories'

export interface AppendSessionMessageInput {
  readonly role: MessageRole
  readonly text: string
}

export const useSessionStore = defineStore('sessions', {
  state: () => ({
    sessions: [] as readonly Session[],
    currentSessionId: null as string | null,
    initialized: false
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
      repository: SessionRepository,
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

      await repository.appendMessage(nextSession, message)
      this.replaceSession(nextSession)
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

    async copyCurrentBranch(repository: MessageRepository) {
      const session = this.requireCurrentSession()
      const sourcePath = getCurrentBranchPath(session)
      const nextSession = copyCurrentSessionBranch(session, {
        ids: sourcePath.map(() => crypto.randomUUID()),
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
