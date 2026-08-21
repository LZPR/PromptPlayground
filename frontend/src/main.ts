import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import {
  TauriSettingsRepository
} from './repositories'
import { sessionRepository } from './repositories/runtime'
import { router } from './router'
import { useSessionStore } from './stores/sessions'
import { useSettingsStore } from './stores/settings'
import './styles/main.css'

const pinia = createPinia()

createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app')

const sessionStore = useSessionStore(pinia)
void sessionStore.initialize(sessionRepository)
void useSettingsStore(pinia).initialize(new TauriSettingsRepository())
