import { expect, test } from '@playwright/test'

test('[app] startup [shows chat shell]', async ({ page }) => {
  await page.goto('/#/chat')

  await expect(page).toHaveTitle('Prompt Playground')
  await expect(page.getByRole('heading', { name: '聊天' })).toBeVisible()
})
