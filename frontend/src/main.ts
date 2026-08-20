import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { SqliteSessionRepository } from './repositories'
import { router } from './router'
import { useSessionStore } from './stores/sessions'
import './styles/main.css'

const pinia = createPinia()

createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app')

if ('__TAURI_INTERNALS__' in window) {
  const sessionStore = useSessionStore(pinia)
  void sessionStore.initialize(new SqliteSessionRepository())
}
