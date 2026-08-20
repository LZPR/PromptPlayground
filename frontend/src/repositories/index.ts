/**
 * Persistence implementations belong here so Vue components never issue SQL.
 * Implementations and complete method signatures are introduced with their
 * corresponding domain model.
 */
export interface SessionRepository {
  readonly repositoryType: 'session'
}

export interface MessageRepository {
  readonly repositoryType: 'message'
}

export interface SettingsRepository {
  readonly repositoryType: 'settings'
}
