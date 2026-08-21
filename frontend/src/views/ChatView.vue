<script setup lang="ts">
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { computed, ref } from 'vue'
import { getCurrentPath } from '@/domain'
import { MemoryMessageRepository, MemorySessionRepository, SqliteMessageRepository, SqliteSessionRepository } from '@/repositories'
import { createGenerationClient } from '@/services/generation'
import { useSessionStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const browserRepository = new MemorySessionRepository()
const isTauri = '__TAURI_INTERNALS__' in window
const sessionRepository = isTauri ? new SqliteSessionRepository() : browserRepository
const messageRepository = isTauri ? new SqliteMessageRepository() : new MemoryMessageRepository(browserRepository)
const generationClient = createGenerationClient()
const draft = ref('')
const error = ref('')
const session = computed(() => sessionStore.currentSession)
const settings = computed(() => settingsStore.settings)
const messages = computed(() => session.value === null ? [] : getCurrentPath(session.value))
const generating = computed(() => session.value !== null && sessionStore.isGenerating(session.value.id))
const generationError = computed(() => session.value === null ? undefined : sessionStore.generationErrors[session.value.id])

async function createSession() {
  error.value = ''
  try {
    await sessionStore.createSession(sessionRepository)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '创建会话失败'
  }
}

async function send() {
  error.value = ''
  try {
    await sessionStore.send(messageRepository, generationClient, settings.value, draft.value)
    draft.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '发送失败'
  }
}

async function regenerate() {
  error.value = ''
  try {
    await sessionStore.regenerate(messageRepository, generationClient, settings.value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '重新生成失败'
  }
}

async function cancel() {
  try {
    await sessionStore.cancelGeneration(generationClient)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '取消失败'
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.isComposing || window.matchMedia('(max-width: 767px)').matches) return
  event.preventDefault()
  if (!generating.value) void send()
}

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(markdown.render(text))
}

function roleLabel(role: 'system' | 'user' | 'assistant') {
  return { system: '系统', user: '用户', assistant: '助手' }[role]
}

function statusLabel(status: string) {
  return { normal: '', pending_deletion: '待删除', generating: '生成中', failed: '失败', cancelled: '已取消' }[status] ?? ''
}
</script>

<template>
  <section class="chat-view">
    <h2>聊天</h2>
    <div v-if="session === null" class="chat-empty"><p>创建一个会话后即可开始对话。</p><button class="primary-button" type="button" aria-label="新建" title="新建会话" @click="createSession">新建会话</button></div>
    <template v-else>
      <div class="chat-messages" aria-live="polite">
        <article v-for="message in messages" :key="message.id" class="chat-message" :class="[`chat-message--${message.role}`, `chat-message--${message.status}`]">
          <header><strong>{{ roleLabel(message.role) }}</strong><span>{{ statusLabel(message.status) }}</span></header>
          <pre v-if="settings.displayMode === 'raw'">{{ message.text }}</pre>
          <!-- DOMPurify sanitizes markdown-it output before this controlled rendering. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-else class="chat-message__markdown" v-html="renderMarkdown(message.text)" />
          <footer v-if="message.role === 'assistant' && message.id === messages.at(-1)?.id && !generating"><button type="button" class="text-button" @click="regenerate">重新生成</button></footer>
        </article>
        <aside v-if="generationError" class="generation-error" role="alert"><strong>{{ generationError.summary }}</strong><details><summary>详情</summary><pre>{{ generationError.detail }}</pre></details><button type="button" class="text-button" :disabled="generating" @click="regenerate">重新生成</button></aside>
      </div>
      <form class="chat-composer" @submit.prevent="send">
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <textarea v-model="draft" aria-label="消息内容" rows="3" :disabled="generating" placeholder="输入消息" @keydown="handleKeydown" />
        <div class="chat-composer__actions"><span v-if="generating">正在生成</span><button v-if="generating" class="danger-button" type="button" @click="cancel">取消</button><button v-else class="primary-button" type="submit">发送</button></div>
      </form>
    </template>
  </section>
</template>
