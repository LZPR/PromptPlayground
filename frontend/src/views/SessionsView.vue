<script setup lang="ts">
import { computed } from 'vue'
import { MemorySessionRepository, SqliteSessionRepository } from '@/repositories'
import { useSessionStore } from '@/stores/sessions'

const store = useSessionStore()
const repository = '__TAURI_INTERNALS__' in window ? new SqliteSessionRepository() : new MemorySessionRepository()
const sessions = computed(() => store.sessions)
const currentSessionId = computed({ get: () => store.currentSessionId, set: (value: string | null) => { store.currentSessionId = value } })
const isGenerating = (sessionId: string) => store.isGenerating(sessionId)
async function create() { await store.createSession(repository) }
</script>

<template>
  <section class="session-panel">
    <h2>会话管理</h2>
    <button class="primary-button" type="button" aria-label="新建" title="新建会话" @click="create">新建会话</button>
    <ul><li v-for="session in sessions" :key="session.id"><button type="button" :class="{ 'is-current': session.id === currentSessionId }" @click="currentSessionId = session.id">{{ session.title }}<small v-if="isGenerating(session.id)">生成中</small></button></li></ul>
  </section>
</template>
