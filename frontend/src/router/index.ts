import { createRouter, createWebHashHistory } from 'vue-router'
import BranchesView from '@/views/BranchesView.vue'
import ChatView from '@/views/ChatView.vue'
import SessionsView from '@/views/SessionsView.vue'
import SettingsView from '@/views/SettingsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/chat' },
    { path: '/chat', component: ChatView },
    { path: '/sessions', component: SessionsView },
    { path: '/branches', component: BranchesView },
    { path: '/settings', component: SettingsView }
  ]
})
