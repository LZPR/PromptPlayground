import type { Session } from '@/domain'

export interface SessionRepository {
  readonly repositoryType: 'session'
  loadAll(): Promise<readonly Session[]>
  create(session: Session): Promise<void>
  rename(session: Session): Promise<void>
  delete(sessionId: string): Promise<void>
}

export interface MessageRepository {
  readonly repositoryType: 'message'
  saveMutation(previous: Session, next: Session): Promise<void>
}

export interface SettingsRepository {
  readonly repositoryType: 'settings'
}

export {
  SESSION_DATABASE_URL,
  SqliteSessionRepository
} from './sqlite-session-repository'
export { SqliteMessageRepository } from './sqlite-message-repository'
export type { SqlClient } from './sqlite-session-repository'
