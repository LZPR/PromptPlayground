<script setup lang="ts">
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { ArrowLeft, ArrowRight, FullScreen, MoreFilled, Plus } from '@element-plus/icons-vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { getCurrentPath, getDirectChildBranches } from '@/domain'
import type { MessageNode, MessageRole } from '@/domain'
import { messageRepository, sessionRepository } from '@/repositories/runtime'
import { chatScrollTarget } from '@/services/chat-navigation'
import { createGenerationClient } from '@/services/generation'
import { useSessionStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'

type EditorMode = 'add-start' | 'add-end' | 'insert-before' | 'insert-after' | 'edit'

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const generationClient = createGenerationClient()
const draft = ref('')
const error = ref('')
const scroller = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const editor = ref<{ mode: EditorMode; target: MessageNode | null; text: string; role: MessageRole; createBranch: boolean; fullscreen: boolean } | null>(null)
const permanentDeleteId = ref<string | null>(null)
const permanentDeleteOpen = ref(false)
const session = computed(() => sessionStore.currentSession)
const messages = computed(() => session.value === null ? [] : getCurrentPath(session.value))
const generating = computed(() => session.value !== null && sessionStore.isGenerating(session.value.id))
const generationError = computed(() => session.value === null ? undefined : sessionStore.generationErrors[session.value.id])
const canSend = computed(() => session.value !== null && draft.value.trim().length > 0 && !generating.value)

function renderMarkdown(text: string) { return DOMPurify.sanitize(markdown.render(text || '（空消息）')) }
function roleLabel(role: MessageRole) { return { system: '系统', user: '用户', assistant: '助手' }[role] }
function statusLabel(status: string) { return ({ normal: '', pending_deletion: '待删除，不会发送', generating: '生成中', failed: '生成失败', cancelled: '已取消' } as Record<string, string>)[status] ?? '' }
async function createSession() { try { await sessionStore.createSession(sessionRepository) } catch (reason) { error.value = failure(reason) } }
async function send() { if (!canSend.value) return; error.value = ''; try { await sessionStore.send(messageRepository, generationClient, settingsStore.settings, draft.value); draft.value = '' } catch (reason) { error.value = failure(reason) } }
async function regenerate() { try { await sessionStore.regenerate(messageRepository, generationClient, settingsStore.settings) } catch (reason) { error.value = failure(reason) } }
async function continueGeneration() { try { await sessionStore.continueGeneration(messageRepository, generationClient, settingsStore.settings) } catch (reason) { error.value = failure(reason) } }
async function cancel() { try { await sessionStore.cancelGeneration(generationClient) } catch (reason) { error.value = failure(reason) } }
function keydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.isComposing && !window.matchMedia('(max-width: 767px)').matches) { event.preventDefault(); void send() } }
function openEditor(mode: EditorMode, target: MessageNode | null = null) {
  editor.value = { mode, target, text: mode === 'edit' && target !== null ? target.text : '', role: target?.role ?? (mode === 'add-end' ? 'user' : 'system'), createBranch: true, fullscreen: window.matchMedia('(max-width: 767px)').matches }
}
function openAddEditor(command: string) { openEditor(command === 'start' ? 'add-start' : 'add-end') }
function handleComposerAction(command: string) { if (command === 'regenerate') void regenerate(); if (command === 'continue') void continueGeneration() }
async function saveEditor() {
  if (editor.value === null) return
  const current = editor.value
  try { await sessionStore.saveMessage(messageRepository, { mode: current.mode, targetId: current.target?.id, role: current.role, text: current.text, createBranch: current.mode === 'edit' ? current.createBranch : undefined }); editor.value = null }
  catch (reason) { error.value = failure(reason) }
}
function handleMessageAction(message: MessageNode, command: string) {
  if (command === 'edit') openEditor('edit', message)
  if (command === 'before') openEditor('insert-before', message)
  if (command === 'after') openEditor('insert-after', message)
  if (command === 'branch') void createBranch(message.id)
  if (command === 'copy') void navigator.clipboard?.writeText(message.text)
  if (command === 'mark') void mutate(() => sessionStore.markMessagePendingDeletion(messageRepository, message.id))
  if (command === 'restore') void mutate(() => sessionStore.restoreMessage(messageRepository, message.id))
  if (command === 'permanent') { permanentDeleteId.value = message.id; permanentDeleteOpen.value = true }
  if (command === 'cancel') void cancel()
  if (command === 'regenerate') void regenerate()
}
async function mutate(action: () => Promise<unknown>) { try { await action() } catch (reason) { error.value = failure(reason) } }
async function createBranch(messageId: string) { await mutate(() => sessionStore.createEmptyBranch(messageRepository, messageId)) }
async function permanentlyDelete() { if (permanentDeleteId.value === null) return; await mutate(() => sessionStore.permanentlyDeleteMessage(messageRepository, permanentDeleteId.value!)); permanentDeleteOpen.value = false }
function messageMenu(message: MessageNode) {
  if (message.status === 'pending_deletion') return [['restore', '恢复'], ['copy', '复制'], ['permanent', '永久删除']]
  if (message.status === 'generating') return [['copy', '复制'], ['cancel', '取消生成']]
  if ((message.status === 'failed' || message.status === 'cancelled') && message.role === 'assistant') return [['edit', '修改'], ['copy', '复制'], ['regenerate', '重新生成']]
  return [['edit', '修改'], ['before', '前插入'], ['after', '后插入'], ['branch', '创建分支'], ['copy', '复制'], ['mark', '标记待删除']]
}
function branchInfo(message: MessageNode) {
  if (session.value === null) return null
  const entries = getDirectChildBranches(session.value, message.id)
  if (entries.length < 2) return null
  const next = messages.value[messages.value.indexOf(message) + 1]
  const current = entries.find((entry) => entry.entry.kind === 'message' ? entry.entry.value.id === next?.id : session.value!.currentEmptyBranchId === entry.entry.value.id)
  return current === undefined ? null : current
}
async function switchBranch(message: MessageNode, direction: 'previous' | 'next') { await mutate(() => sessionStore.switchDirectChildBranch(messageRepository, message.id, direction)) }
function onScroll() { const element = scroller.value; if (element !== null) atBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 32 }
async function scrollLatest() { await nextTick(); scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' }); atBottom.value = true }
async function scrollTarget(id: string) { await nextTick(); document.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); chatScrollTarget.value = null }
function failure(reason: unknown) { return reason instanceof Error ? reason.message : '操作失败，请重试' }
watch(messages, () => { if (atBottom.value) void scrollLatest() }, { deep: true })
watch(chatScrollTarget, (id) => { if (id !== null) void scrollTarget(id) })
onMounted(() => { if (chatScrollTarget.value !== null) void scrollTarget(chatScrollTarget.value) })
</script>

<template>
  <section class="chat-view" :class="{ 'chat-view--editor-fullscreen': editor?.fullscreen }">
    <header class="chat-view__header"><div><h1>聊天</h1><p v-if="session">{{ session.title }}</p></div><el-dropdown v-if="session" trigger="click" @command="openAddEditor"><button class="icon-button" type="button" aria-label="添加新消息" title="添加新消息" :disabled="generating"><Plus /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="start" :disabled="generating">在开头添加消息</el-dropdown-item><el-dropdown-item command="end" :disabled="generating">在末尾添加消息</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header>
    <div v-if="session === null" class="chat-empty"><p>创建一个会话后即可开始对话。</p><button class="primary-button" type="button" @click="createSession">新建会话</button></div>
    <template v-else>
      <div ref="scroller" class="chat-messages" aria-live="polite" @scroll="onScroll">
        <template v-for="message in messages" :key="message.id"><article :data-message-id="message.id" class="chat-message" :class="[`chat-message--${message.role}`, `chat-message--${message.status}`]"><header><strong>{{ roleLabel(message.role) }}</strong><span>{{ statusLabel(message.status) }}</span><el-dropdown trigger="click" @command="(command: string) => handleMessageAction(message, command)"><button class="icon-button icon-button--compact chat-message__menu" type="button" aria-label="消息更多操作" title="更多操作"><MoreFilled /></button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="item in messageMenu(message)" :key="item[0]" :command="item[0]" :divided="item[0] === 'mark' || item[0] === 'permanent'">{{ item[1] }}</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header><pre v-if="settingsStore.settings.displayMode === 'raw'">{{ message.text || '（空消息）' }}</pre><!-- eslint-disable-next-line vue/no-v-html --><div v-else class="chat-message__markdown" v-html="renderMarkdown(message.text)" /></article><div v-if="branchInfo(message) as branch" class="branch-divider"><button class="icon-button icon-button--compact" type="button" aria-label="上一个分支" :disabled="branch.index === 0" @click="switchBranch(message, 'previous')"><ArrowLeft /></button><span>{{ branch.index + 1 }}/{{ branch.total }}</span><button class="icon-button icon-button--compact" type="button" aria-label="下一个分支" :disabled="branch.index + 1 === branch.total" @click="switchBranch(message, 'next')"><ArrowRight /></button></div></template>
        <aside v-if="generationError" class="generation-error" role="alert"><strong>{{ generationError.summary }}</strong><details><summary>详情</summary><pre>{{ generationError.detail }}</pre></details><button class="text-button" type="button" :disabled="generating" @click="regenerate">重新生成</button></aside>
      </div>
      <button v-if="!atBottom" class="back-to-latest" type="button" @click="scrollLatest">回到最新消息</button>
      <form v-if="editor === null" class="chat-composer" @submit.prevent="send"><p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="chat-composer__field"><el-dropdown trigger="click" @command="handleComposerAction"><button class="icon-button" type="button" aria-label="更多聊天操作" title="更多操作" :disabled="generating"><MoreFilled /></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="continue" :disabled="generating">继续生成</el-dropdown-item><el-dropdown-item command="regenerate" :disabled="generating">重新生成</el-dropdown-item></el-dropdown-menu></template></el-dropdown><textarea v-model="draft" aria-label="消息内容" rows="2" :disabled="generating" placeholder="输入消息" @keydown="keydown" /><button v-if="generating" class="danger-button" type="button" @click="cancel">取消</button><button v-else class="primary-button" type="submit" :disabled="!canSend">发送</button></div></form>
      <section v-else class="message-editor"><header><strong>{{ editor.mode === 'edit' ? '修改消息' : '添加消息' }}</strong><button class="icon-button" type="button" :aria-label="editor.fullscreen ? '退出全屏编辑器' : '全屏编辑器'" @click="editor.fullscreen = !editor.fullscreen"><FullScreen /></button></header><label>Role<select v-model="editor.role"><option value="system">系统</option><option value="user">用户</option><option value="assistant">助手</option></select></label><label v-if="editor.mode === 'edit'" class="editor-toggle"><input v-model="editor.createBranch" type="checkbox" /> 创建新分支</label><textarea v-model="editor.text" aria-label="编辑消息内容" rows="6" /><footer><button class="text-button" type="button" @click="editor = null">取消</button><button class="primary-button" type="button" @click="saveEditor">保存</button></footer></section>
    </template>
    <el-dialog v-model="permanentDeleteOpen" title="永久删除消息" width="440px"><p>直接子节点会重新连接到原父节点。此操作不可撤销。</p><template #footer><button class="text-button" type="button" @click="permanentDeleteOpen = false">取消</button><button class="danger-button" type="button" @click="permanentlyDelete">永久删除</button></template></el-dialog>
  </section>
</template>
