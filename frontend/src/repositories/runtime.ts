import {
  MemoryMessageRepository,
  MemorySessionRepository,
  SqliteMessageRepository,
  SqliteSessionRepository
} from './index'

const browserSessions = new MemorySessionRepository()
const isTauri = '__TAURI_INTERNALS__' in window

export const sessionRepository = isTauri
  ? new SqliteSessionRepository()
  : browserSessions

export const messageRepository = isTauri
  ? new SqliteMessageRepository()
  : new MemoryMessageRepository(browserSessions)
