<script setup lang="ts">
import { ChatDotRound, Close, Connection, Menu, Setting } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const sidebarCollapsed = ref(false)
const mobileNavigationOpen = ref(false)

const mobileTitle = computed(() => {
  const titles = new Map([
    ['/chat', '聊天'],
    ['/sessions', '会话管理'],
    ['/branches', '分支管理'],
    ['/settings', '全局设置']
  ])

  return titles.get(route.path) ?? 'Prompt Playground'
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function closeMobileNavigation() {
  mobileNavigationOpen.value = false
}
</script>

<template>
  <main class="app-shell" :class="{ 'app-shell--collapsed': sidebarCollapsed }">
    <header class="mobile-header">
      <button
        class="icon-button"
        type="button"
        aria-label="打开主导航"
        :aria-expanded="mobileNavigationOpen"
        @click="mobileNavigationOpen = true"
      >
        <Menu aria-hidden="true" />
      </button>
      <strong>{{ mobileTitle }}</strong>
      <span class="mobile-header__spacer" aria-hidden="true" />
    </header>

    <aside class="sidebar" :class="{ 'sidebar--mobile-open': mobileNavigationOpen }" aria-label="主导航">
      <div class="sidebar__brand">
        <h1 v-show="!sidebarCollapsed">Prompt Playground</h1>
        <span v-show="sidebarCollapsed" class="sidebar__monogram" aria-label="Prompt Playground">P</span>
        <button
          class="icon-button sidebar__collapse"
          type="button"
          :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <Menu aria-hidden="true" />
        </button>
        <button class="icon-button sidebar__close" type="button" aria-label="关闭主导航" @click="closeMobileNavigation">
          <Close aria-hidden="true" />
        </button>
      </div>
      <nav class="sidebar__nav" aria-label="主导航">
        <RouterLink to="/chat" title="聊天" @click="closeMobileNavigation">
          <ChatDotRound aria-hidden="true" />
          <span>聊天</span>
        </RouterLink>
        <RouterLink to="/sessions" title="会话管理" @click="closeMobileNavigation">
          <Connection aria-hidden="true" />
          <span>会话</span>
        </RouterLink>
        <RouterLink to="/branches" title="分支管理" @click="closeMobileNavigation">
          <Connection aria-hidden="true" />
          <span>分支</span>
        </RouterLink>
      </nav>
      <RouterLink
        class="sidebar__settings"
        to="/settings"
        aria-label="全局设置"
        title="全局设置"
        @click="closeMobileNavigation"
      >
        <Setting aria-hidden="true" />
        <span>设置</span>
      </RouterLink>
    </aside>
    <button
      v-if="mobileNavigationOpen"
      class="navigation-scrim"
      type="button"
      aria-label="关闭主导航"
      @click="closeMobileNavigation"
    />
    <section class="content" aria-live="polite">
      <RouterView />
    </section>
  </main>
</template>
