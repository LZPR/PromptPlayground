<script setup lang="ts">
import { ArrowRight, MoreFilled } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { buildBranchTree, countBranchMessages, getCurrentPath } from '@/domain'
import type { BranchTreeEntry } from '@/domain'
import { messageRepository } from '@/repositories/runtime'
import { requestChatScroll } from '@/services/chat-navigation'
import { createGenerationClient } from '@/services/generation'
import { useSessionStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'

const store = useSessionStore()
const settings = useSettingsStore()
const client = createGenerationClient()
const deleteId = ref<string | null>(null)
const deleteOpen = ref(false)
const error = ref('')
const expanded = ref(new Set<string>())
const session = computed(() => store.currentSession)
const path = computed(() => session.value === null ? [] : getCurrentPath(session.value))
const entries = computed(() => session.value === null ? [] : buildBranchTree(session.value, expanded.value))
const deleteCount = computed(() => session.value === null || deleteId.value === null ? 0 : countBranchMessages(session.value, deleteId.value))
const summary = computed(() => path.value.length === 0 ? '空路径' : path.value.map((message) => summaryText(message.text)).join(' / '))

function summaryText(text: string) { return text.length === 0 ? '（空消息）' : Array.from(text).slice(0, 20).join('') }
function toggle(entry: BranchTreeEntry) {
  if (!entry.expandable) return
  const next = new Set(expanded.value)
  if (next.has(entry.id)) next.delete(entry.id)
  else next.add(entry.id)
  expanded.value = next
}
async function select(entry: BranchTreeEntry) {
  if (entry.kind === 'root') return
  try {
    if (entry.kind === 'empty') await store.selectCurrentEmptyBranch(messageRepository, entry.id)
    else await store.selectPathContainingMessage(messageRepository, entry.id)
    requestChatScroll(entry.kind === 'empty' ? session.value!.emptyBranches[entry.id]!.anchorId : entry.id)
  } catch (reason) { error.value = failure(reason) }
}
async function cloneCurrent() { try { await store.copyCurrentBranch(messageRepository) } catch (reason) { error.value = failure(reason) } }
function action(entry: BranchTreeEntry, command: string) {
  if (command === 'clone') { void cloneCurrent(); return }
  if (command === 'delete' && entry.deletable) { deleteId.value = entry.id; deleteOpen.value = true; return }
  if (command === 'copy' && entry.kind === 'message') void copyText(session.value!.nodes[entry.id]!.kind === 'message' ? session.value!.nodes[entry.id]!.text : '')
  if (command === 'new' && entry.kind === 'message') void createBranch(entry.id)
  if (command === 'continue' && entry.kind === 'empty') void continueGeneration(entry.id)
}
async function createBranch(anchorId: string) { try { await store.createEmptyBranch(messageRepository, anchorId) } catch (reason) { error.value = failure(reason) } }
async function continueGeneration(emptyBranchId: string) { try { await store.selectCurrentEmptyBranch(messageRepository, emptyBranchId); await store.continueGeneration(messageRepository, client, settings.settings) } catch (reason) { error.value = failure(reason) } }
async function remove() { if (deleteId.value === null) return; try { await store.deleteBranch(messageRepository, deleteId.value); deleteOpen.value = false } catch (reason) { error.value = failure(reason) } }
async function copyText(text: string) { await navigator.clipboard?.writeText(text) }
function failure(reason: unknown) { return reason instanceof Error ? reason.message : '操作失败，请重试' }
</script>

<template>
  <section class="workspace-panel branch-panel" aria-labelledby="branches-heading">
    <header class="workspace-panel__header">
      <div><h2 id="branches-heading">分支</h2><p class="branch-summary">{{ summary }}</p></div>
      <el-dropdown trigger="click" @command="(command: string) => command === 'clone' && cloneCurrent()">
        <button class="icon-button" type="button" aria-label="当前分支更多操作" title="更多操作" :disabled="session === null"><MoreFilled aria-hidden="true" /></button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="clone" :disabled="session === null">克隆当前分支</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="session === null" class="panel-empty">选择或创建会话后查看分支。</p>
    <ul v-else class="branch-tree"><li v-for="entry in entries" :key="entry.id" :class="{ 'is-current': entry.selected, 'branch-tree__root': entry.kind === 'root' }" :style="{ '--depth': entry.depth }">
      <button v-if="entry.expandable" class="branch-tree__toggle" type="button" :aria-label="expanded.has(entry.id) ? '收起分支' : '展开分支'" @click="toggle(entry)"><ArrowRight :class="{ 'is-expanded': expanded.has(entry.id) }" /></button><span v-else class="branch-tree__indent" />
      <span v-if="entry.kind === 'root'" class="branch-tree__select">{{ entry.label }}</span><button v-else class="branch-tree__select" type="button" @click="select(entry)">{{ entry.label }}</button>
      <el-dropdown trigger="click" @command="(command: string) => action(entry, command)"><button class="icon-button icon-button--compact" type="button" aria-label="分支更多操作" title="更多操作"><MoreFilled /></button><template #dropdown><el-dropdown-menu>
        <el-dropdown-item v-if="entry.kind === 'root'" command="clone">克隆当前分支</el-dropdown-item>
        <el-dropdown-item v-if="entry.kind === 'message'" command="copy">复制文本</el-dropdown-item><el-dropdown-item v-if="entry.kind === 'message'" command="new">创建分支</el-dropdown-item><el-dropdown-item v-if="entry.kind === 'empty'" command="continue">继续生成</el-dropdown-item><el-dropdown-item v-if="entry.deletable" command="delete" divided>删除分支</el-dropdown-item>
      </el-dropdown-menu></template></el-dropdown>
    </li></ul>
  </section>
  <el-dialog v-model="deleteOpen" title="删除分支" width="440px"><p>将永久移除 {{ deleteCount }} 条真实消息{{ deleteCount === 0 ? '；此空分支不会删除聊天消息。' : '及其后续分支。' }}</p><template #footer><button class="text-button" type="button" @click="deleteOpen = false">取消</button><button class="danger-button" type="button" @click="remove">删除分支</button></template></el-dialog>
</template>
