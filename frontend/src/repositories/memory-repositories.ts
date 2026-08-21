import type { Session } from '@/domain'
import type { MessageRepository, SessionRepository } from './index'

/** Browser-only development fallback; desktop persistence always uses SQLite. */
export class MemorySessionRepository implements SessionRepository {
  readonly repositoryType = 'session' as const
  private sessions: Session[] = []

  async loadAll(): Promise<readonly Session[]> {
    return this.sessions
  }

  async create(session: Session): Promise<void> {
    this.sessions = [session, ...this.sessions]
  }

  async rename(session: Session): Promise<void> {
    this.sessions = this.sessions.map((current) => current.id === session.id ? session : current)
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions = this.sessions.filter((session) => session.id !== sessionId)
  }
}

export class MemoryMessageRepository implements MessageRepository {
  readonly repositoryType = 'message' as const

  constructor(private readonly sessions: MemorySessionRepository) {}

  async saveMutation(previous: Session, next: Session): Promise<void> {
    await this.sessions.rename(next)
  }
}
