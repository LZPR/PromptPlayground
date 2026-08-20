<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <h1>Prompt Playground</h1>
      <nav>
        <RouterLink to="/sessions">会话</RouterLink>
        <RouterLink to="/branches">分支</RouterLink>
      </nav>
      <RouterLink class="settings-link" to="/settings" aria-label="全局设置">设置</RouterLink>
    </aside>
    <section class="content">
      <RouterView />
    </section>
  </main>
</template>
