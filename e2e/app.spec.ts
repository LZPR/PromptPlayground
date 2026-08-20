import { expect, test } from '@playwright/test'

test('[app] startup [shows chat shell]', async ({ page }) => {
  await page.goto('/#/chat')

  await expect(page).toHaveTitle('Prompt Playground')
  await expect(page.getByRole('heading', { name: '聊天' })).toBeVisible()
  await expect(page.getByRole('link', { name: '聊天' })).toHaveClass(/router-link-active/)
  await expect(page.getByRole('link', { name: '全局设置' })).toBeVisible()
})

test('[app] navigation [collapses sidebar and preserves routes]', async ({ page }) => {
  await page.goto('/#/chat')

  await page.getByRole('button', { name: '收起侧栏' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--collapsed/)

  await page.getByRole('link', { name: '分支' }).click()
  await expect(page).toHaveURL(/#\/branches$/)
  await expect(page.getByRole('heading', { name: '分支管理' })).toBeVisible()
})

test('[app] navigation [opens from narrow screens]', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/#/chat')

  await page.getByRole('button', { name: '打开主导航' }).click()
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.getByRole('link', { name: '会话' }).click()

  await expect(page).toHaveURL(/#\/sessions$/)
  await expect(page.getByRole('heading', { name: '会话管理' })).toBeVisible()
})
