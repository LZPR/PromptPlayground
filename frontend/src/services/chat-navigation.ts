import { ref } from 'vue'

export const chatScrollTarget = ref<string | null>(null)

export function requestChatScroll(messageId: string): void {
  chatScrollTarget.value = messageId
}
