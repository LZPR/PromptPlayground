<script setup lang="ts">
import { MoreFilled, Plus } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { sessionRepository } from '@/repositories/runtime'
import { useSessionStore } from '@/stores/sessions'

const store = useSessionStore()
const actionSessionId = ref<string | null>(null)
const renameOpen = ref(false)
const cloneOpen = ref(false)
const deleteOpen = ref(false)
const title = ref('')
const deleteTitle = ref('')
const cloneMode = ref<'full' | 'system'>('full')
const error = ref('')

const sessions = computed(() => [...store.sessions].sort((left, right) =>
  right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
))
const actionSession = computed(() =>
  store.sessions.find((session) => session.id === actionSessionId.value) ?? null
)

async function create() {
  error.value = ''
  try { await store.createSession(sessionRepository) } catch (reason) { error.value = failure(reason) }
}
function select(sessionId: string) { store.currentSessionId = sessionId }
function openAction(sessionId: string, command: string) {
  actionSessionId.value = sessionId
  const session = actionSession.value
  if (session === null) return
  if (command === 'rename') { title.value = session.title; renameOpen.value = true }
  if (command === 'clone') { cloneMode.value = 'full'; cloneOpen.value = true }
  if (command === 'delete') { deleteTitle.value = ''; deleteOpen.value = true }
}
async function rename() {
  if (actionSession.value === null || title.value.trim().length === 0) return
  error.value = ''
  const previous = store.currentSessionId
  store.currentSessionId = actionSession.value.id
  try { await store.renameSession(sessionRepository, title.value.trim()); renameOpen.value = false }
  catch (reason) { error.value = failure(reason) }
  finally { if (previous !== actionSessionId.value) store.currentSessionId = previous }
}
async function clone() {
  if (actionSession.value === null) return
  error.value = ''
  const previous = store.currentSessionId
  store.currentSessionId = actionSession.value.id
  try { await store.cloneSession(sessionRepository, cloneMode.value); cloneOpen.value = false }
  catch (reason) { error.value = failure(reason); store.currentSessionId = previous }
}
async function remove() {
  if (actionSession.value === null || deleteTitle.value !== actionSession.value.title) return
  error.value = ''
  try { await store.deleteSession(sessionRepository, actionSession.value.id); deleteOpen.value = false }
  catch (reason) { error.value = failure(reason) }
}
function failure(reason: unknown) { return reason instanceof Error ? reason.message : '操作失败，请重试' }
</script>

<template>
  <section class="workspace-panel session-panel" aria-labelledby="sessions-heading">
    <header class="workspace-panel__header">
      <div><h2 id="sessions-heading">会话</h2><p>选择会话以切换聊天上下文</p></div>
      <button class="icon-button" type="button" title="新建会话" aria-label="新建会话" @click="create"><Plus aria-hidden="true" /></button>
    </header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="sessions.length === 0" class="panel-empty">还没有会话。</p>
    <ul v-else class="session-list">
      <li v-for="session in sessions" :key="session.id" :class="{ 'is-current': session.id === store.currentSessionId }">
        <button class="session-list__select" type="button" :aria-current="session.id === store.currentSessionId ? 'page' : undefined" @click="select(session.id)">
          <span>{{ session.title }}</span><small v-if="store.isGenerating(session.id)">生成中</small><small v-else-if="session.id === store.currentSessionId">当前会话</small>
        </button>
        <el-dropdown trigger="click" @command="(command: string) => openAction(session.id, command)">
          <button class="icon-button icon-button--compact" type="button" aria-label="会话更多操作" title="更多操作" @click.stop><MoreFilled aria-hidden="true" /></button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="rename">重命名</el-dropdown-item>
            <el-dropdown-item command="clone" :disabled="store.isGenerating(session.id)">克隆</el-dropdown-item>
            <el-dropdown-item command="delete" divided :disabled="store.isGenerating(session.id)">删除</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </li>
    </ul>
  </section>
  <el-dialog v-model="renameOpen" title="重命名会话" width="520px" destroy-on-close>
    <label class="dialog-field">会话标题<input v-model="title" autofocus /></label><p v-if="title.trim().length === 0" class="form-error">标题不能为空。</p>
    <template #footer><button class="text-button" type="button" @click="renameOpen = false">取消</button><button class="primary-button" type="button" :disabled="title.trim().length === 0" @click="rename">保存</button></template>
  </el-dialog>
  <el-dialog v-model="cloneOpen" title="克隆会话" width="520px" destroy-on-close>
    <fieldset class="dialog-field"><legend>克隆范围</legend><label><input v-model="cloneMode" type="radio" value="full" /> 完整克隆</label><label><input v-model="cloneMode" type="radio" value="system" /> 仅保留当前路径系统提示词</label></fieldset>
    <template #footer><button class="text-button" type="button" @click="cloneOpen = false">取消</button><button class="primary-button" type="button" @click="clone">克隆</button></template>
  </el-dialog>
  <el-dialog v-model="deleteOpen" title="删除会话" width="440px" destroy-on-close>
    <p>此操作会永久删除会话和全部消息。输入会话标题以确认。</p><label class="dialog-field">{{ actionSession?.title }}<input v-model="deleteTitle" /></label>
    <template #footer><button class="text-button" type="button" @click="deleteOpen = false">取消</button><button class="danger-button" type="button" :disabled="deleteTitle !== actionSession?.title" @click="remove">永久删除</button></template>
  </el-dialog>
</template>
