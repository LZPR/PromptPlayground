<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { healthCheck } from '@/services/backend'

const backendReady = ref(false)

onMounted(async () => {
  if ('__TAURI_INTERNALS__' in window) {
    backendReady.value = (await healthCheck()) === 'ok'
  }
})
</script>

<template>
  <section>
    <h2>聊天</h2>
    <p>项目骨架已就绪。会话与消息树将在后续迭代中实现。</p>
    <p v-if="backendReady">桌面后端已连接。</p>
  </section>
</template>
