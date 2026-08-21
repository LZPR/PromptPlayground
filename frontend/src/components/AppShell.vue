<script setup lang="ts">
import { Close, Connection, FullScreen, Menu, Setting } from '@element-plus/icons-vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import BranchesView from '@/views/BranchesView.vue'
import ChatView from '@/views/ChatView.vue'
import SessionsView from '@/views/SessionsView.vue'

type SidebarMode = 'collapsed' | 'expanded' | 'fullscreen'
type WorkspacePanel = 'sessions' | 'branches'
const route = useRoute()
const sidebarMode = ref<SidebarMode>('expanded')
const workspacePanel = ref<WorkspacePanel>('sessions')
const mobileNavigationOpen = ref(false)
const isSettings = computed(() => route.path === '/settings')
const mobileTitle = computed(() => isSettings.value ? '全局设置' : '聊天')
function openPanel(panel: WorkspacePanel) { workspacePanel.value = panel; if (sidebarMode.value === 'collapsed') sidebarMode.value = 'expanded' }
function toggleSidebar() { sidebarMode.value = sidebarMode.value === 'collapsed' ? 'expanded' : 'collapsed' }
function toggleFullscreen() { sidebarMode.value = sidebarMode.value === 'fullscreen' ? 'expanded' : 'fullscreen' }
function openSettings() { sidebarMode.value = 'collapsed'; mobileNavigationOpen.value = false }
watch(isSettings, (value) => { if (value) openSettings() }, { immediate: true })
</script>

<template>
  <main class="app-shell" :class="[`app-shell--${sidebarMode}`, { 'app-shell--settings': isSettings }]">
    <header class="mobile-header"><button class="icon-button" type="button" aria-label="打开工作侧栏" :aria-expanded="mobileNavigationOpen" @click="mobileNavigationOpen = true"><Menu /></button><strong>{{ mobileTitle }}</strong><span /></header>
    <aside class="sidebar" :class="[`sidebar--${sidebarMode}`, { 'sidebar--mobile-open': mobileNavigationOpen }]" aria-label="工作侧栏">
      <div class="sidebar__brand"><strong v-show="sidebarMode !== 'collapsed'">Prompt Playground</strong><button class="icon-button" type="button" :aria-label="sidebarMode === 'collapsed' ? '展开侧栏' : '收起侧栏'" :title="sidebarMode === 'collapsed' ? '展开侧栏' : '收起侧栏'" @click="toggleSidebar"><Menu /></button><button v-if="sidebarMode !== 'collapsed'" class="icon-button" type="button" :aria-label="sidebarMode === 'fullscreen' ? '退出全屏侧栏' : '全屏侧栏'" :title="sidebarMode === 'fullscreen' ? '退出全屏侧栏' : '全屏侧栏'" @click="toggleFullscreen"><FullScreen /></button><button class="icon-button sidebar__close" type="button" aria-label="关闭工作侧栏" @click="mobileNavigationOpen = false"><Close /></button></div>
      <nav class="sidebar__tabs" aria-label="工作区视图"><button type="button" aria-label="会话" title="会话" :class="{ 'is-active': workspacePanel === 'sessions' }" :aria-current="workspacePanel === 'sessions' ? 'page' : undefined" @click="openPanel('sessions')"><Connection /><span>会话</span></button><button type="button" aria-label="分支" title="分支" :class="{ 'is-active': workspacePanel === 'branches' }" :aria-current="workspacePanel === 'branches' ? 'page' : undefined" @click="openPanel('branches')"><Connection /><span>分支</span></button></nav>
      <section v-show="sidebarMode !== 'collapsed'" class="sidebar__panel"><KeepAlive><SessionsView v-if="workspacePanel === 'sessions'" /><BranchesView v-else /></KeepAlive></section>
      <RouterLink class="sidebar__settings" to="/settings" aria-label="全局设置" title="全局设置" @click="openSettings"><Setting /><span>设置</span></RouterLink>
    </aside>
    <button v-if="mobileNavigationOpen" class="navigation-scrim" type="button" aria-label="关闭工作侧栏" @click="mobileNavigationOpen = false" />
    <section class="content"><ChatView v-show="!isSettings" /><RouterView v-if="isSettings" /></section>
  </main>
</template>
