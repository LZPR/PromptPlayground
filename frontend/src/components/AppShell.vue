<script setup lang="ts">
import { ChatDotRound, Close, Connection, FullScreen, Menu, Setting } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import BranchesView from '@/views/BranchesView.vue'
import ChatView from '@/views/ChatView.vue'
import SessionsView from '@/views/SessionsView.vue'

type SidebarMode = 'collapsed' | 'expanded' | 'fullscreen'
type WorkspacePanel = 'chat' | 'sessions' | 'branches'

const route = useRoute()
const sidebarMode = ref<SidebarMode>('expanded')
const workspacePanel = ref<WorkspacePanel>('chat')
const mobileNavigationOpen = ref(false)

const isSettings = computed(() => route.path === '/settings')
const mobileTitle = computed(() => {
  if (isSettings.value) return '全局设置'
  if (workspacePanel.value === 'sessions') return '会话管理'
  if (workspacePanel.value === 'branches') return '分支管理'
  return '聊天'
})

function openPanel(panel: WorkspacePanel) {
  workspacePanel.value = panel
  if (panel === 'chat') {
    sidebarMode.value = 'collapsed'
  } else if (sidebarMode.value === 'collapsed') {
    sidebarMode.value = 'expanded'
  }
  mobileNavigationOpen.value = false
}

function toggleSidebar() {
  sidebarMode.value = sidebarMode.value === 'collapsed' ? 'expanded' : 'collapsed'
}

function toggleFullscreen() {
  sidebarMode.value = sidebarMode.value === 'fullscreen' ? 'expanded' : 'fullscreen'
}

function closeMobileNavigation() {
  mobileNavigationOpen.value = false
}
</script>

<template>
  <main
    class="app-shell"
    :class="{
      'app-shell--collapsed': sidebarMode === 'collapsed',
      'app-shell--fullscreen': sidebarMode === 'fullscreen'
    }"
  >
    <header class="mobile-header">
      <button
        class="icon-button"
        type="button"
        aria-label="打开工作侧栏"
        :aria-expanded="mobileNavigationOpen"
        @click="mobileNavigationOpen = true"
      >
        <Menu aria-hidden="true" />
      </button>
      <strong>{{ mobileTitle }}</strong>
      <span class="mobile-header__spacer" aria-hidden="true" />
    </header>

    <aside
      class="sidebar"
      :class="[
        `sidebar--${sidebarMode}`,
        { 'sidebar--mobile-open': mobileNavigationOpen }
      ]"
      aria-label="工作侧栏"
    >
      <div class="sidebar__brand">
        <h1 v-show="sidebarMode !== 'collapsed'">Prompt Playground</h1>
        <span v-show="sidebarMode === 'collapsed'" class="sidebar__monogram" aria-label="Prompt Playground">P</span>
        <button
          class="icon-button sidebar__collapse"
          type="button"
          :aria-label="sidebarMode === 'collapsed' ? '展开侧栏' : '收起侧栏'"
          :title="sidebarMode === 'collapsed' ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <Menu aria-hidden="true" />
        </button>
        <button
          v-if="sidebarMode !== 'collapsed'"
          class="icon-button sidebar__fullscreen"
          type="button"
          :aria-label="sidebarMode === 'fullscreen' ? '退出全屏侧栏' : '全屏侧栏'"
          :title="sidebarMode === 'fullscreen' ? '退出全屏侧栏' : '全屏侧栏'"
          @click="toggleFullscreen"
        >
          <FullScreen aria-hidden="true" />
        </button>
        <button class="icon-button sidebar__close" type="button" aria-label="关闭工作侧栏" @click="closeMobileNavigation">
          <Close aria-hidden="true" />
        </button>
      </div>

      <nav class="sidebar__nav" aria-label="工作区导航">
        <button :class="{ 'is-active': workspacePanel === 'chat' }" type="button" title="聊天" @click="openPanel('chat')">
          <ChatDotRound aria-hidden="true" /><span>聊天</span>
        </button>
        <button :class="{ 'is-active': workspacePanel === 'sessions' }" type="button" title="会话管理" @click="openPanel('sessions')">
          <Connection aria-hidden="true" /><span>会话</span>
        </button>
        <button :class="{ 'is-active': workspacePanel === 'branches' }" type="button" title="分支管理" @click="openPanel('branches')">
          <Connection aria-hidden="true" /><span>分支</span>
        </button>
      </nav>

      <section v-if="sidebarMode !== 'collapsed' && !isSettings" class="sidebar__panel" aria-live="polite">
        <SessionsView v-if="workspacePanel === 'sessions'" />
        <BranchesView v-else-if="workspacePanel === 'branches'" />
      </section>

      <RouterLink class="sidebar__settings" to="/settings" aria-label="全局设置" title="全局设置" @click="closeMobileNavigation">
        <Setting aria-hidden="true" /><span>设置</span>
      </RouterLink>
    </aside>

    <button v-if="mobileNavigationOpen" class="navigation-scrim" type="button" aria-label="关闭工作侧栏" @click="closeMobileNavigation" />

    <section class="content" aria-live="polite">
      <RouterView v-if="isSettings" />
      <ChatView v-else />
    </section>
  </main>
</template>
