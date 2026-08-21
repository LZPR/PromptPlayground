<template>
  <section class="settings-view">
    <h2>全局设置</h2>
    <form class="settings-form" @submit.prevent="save">
      <label>Base URL
        <input v-model.trim="draft.baseUrl" type="url" placeholder="https://api.example.com/v1" autocomplete="url" />
      </label>
      <label>API Key
        <div class="settings-form__key">
          <input v-model="apiKey" type="password" :placeholder="settings.apiKeyPresent ? '已保存，输入以替换' : '输入 API Key'" autocomplete="off" />
          <button v-if="settings.apiKeyPresent" class="danger-button" type="button" @click="clearKey">清除</button>
        </div>
      </label>
      <label>模型名
        <input v-model.trim="draft.model" type="text" placeholder="例如 gpt-4o-mini" />
      </label>
      <div class="settings-form__grid">
        <label>温度<input v-model.number="draft.temperature" type="number" min="0" max="2" step="0.1" /></label>
        <label>最大输出<input v-model.number="draft.maxOutput" type="number" min="1" max="32768" step="1" /></label>
      </div>
      <label class="settings-form__toggle"><input v-model="draft.stream" type="checkbox" /> 流式响应</label>
      <fieldset><legend>显示模式</legend><label><input v-model="draft.displayMode" type="radio" value="markdown" /> Markdown</label><label><input v-model="draft.displayMode" type="radio" value="raw" /> Raw</label></fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="settings-form__actions"><button class="primary-button" type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存设置' }}</button></div>
    </form>
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { TauriSettingsRepository } from '@/repositories'
import { useSettingsStore } from '@/stores/settings'

const store = useSettingsStore()
const repository = new TauriSettingsRepository()
const settings = computed(() => store.settings)
const draft = reactive({ ...store.settings })
const apiKey = ref('')
const saving = ref(false)
const error = ref('')

watch(settings, (value) => Object.assign(draft, value), { deep: true })

async function save() {
  error.value = ''
  if (draft.temperature < 0 || draft.temperature > 2 || draft.maxOutput < 1) {
    error.value = '温度应在 0 到 2 之间，最大输出必须大于 0。'
    return
  }
  saving.value = true
  try {
    await store.save(repository, { baseUrl: draft.baseUrl, model: draft.model, temperature: draft.temperature, maxOutput: draft.maxOutput, stream: draft.stream, displayMode: draft.displayMode })
    if (apiKey.value.length > 0) {
      await store.replaceApiKey(repository, apiKey.value)
      apiKey.value = ''
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '设置保存失败'
  } finally {
    saving.value = false
  }
}

async function clearKey() {
  if (!window.confirm('清除 API Key 不会删除会话或其他偏好。是否继续？')) return
  error.value = ''
  try {
    await store.clearApiKey(repository)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'API Key 清除失败'
  }
}
</script>
