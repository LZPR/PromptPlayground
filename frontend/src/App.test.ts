import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from './stores/app'

describe('[app] store [initializes]', () => {
  it('marks the application as initialized', () => {
    setActivePinia(createPinia())
    const store = useAppStore()

    store.markInitialized()

    expect(store.initialized).toBe(true)
  })
})
