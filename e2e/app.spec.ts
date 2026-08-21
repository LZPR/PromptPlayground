import { expect, test } from '@playwright/test'

test('[app] startup [shows the chat workspace and settings entry]', async ({ page }) => {
  await page.goto('/#/chat')

  await expect(page).toHaveTitle('Prompt Playground')
  await expect(page.getByRole('heading', { name: '聊天' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '工作侧栏' })).toBeVisible()
  await expect(page.getByRole('link', { name: '全局设置' })).toBeVisible()
})

test('[workspace sidebar] states [opens panels without navigating away from chat]', async ({ page }) => {
  await page.goto('/#/chat')

  await page.getByRole('button', { name: '会话' }).click()
  await expect(page.getByRole('heading', { name: '会话管理' })).toBeVisible()
  await expect(page).toHaveURL(/#\/chat$/)

  await page.getByRole('button', { name: '收起侧栏' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--collapsed/)

  await page.getByRole('button', { name: '分支' }).click()
  await expect(page.getByRole('heading', { name: '分支管理' })).toBeVisible()
  await page.getByRole('button', { name: '全屏侧栏' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--fullscreen/)
  await expect(page.getByRole('heading', { name: '聊天' })).toBeAttached()
})

test('[workspace sidebar] narrow screen [opens the overlay panel]', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/#/chat')

  await page.getByRole('button', { name: '打开工作侧栏' }).click()
  await expect(page.getByRole('complementary', { name: '工作侧栏' })).toBeVisible()
  await page.getByRole('button', { name: '分支' }).click()
  await expect(page.getByRole('heading', { name: '分支管理' })).toBeVisible()
})

test('[app] settings [uses its own route]', async ({ page }) => {
  await page.goto('/#/chat')
  await page.getByRole('link', { name: '全局设置' }).click()

  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('heading', { name: '全局设置' })).toBeVisible()
})

test('[generation] browser adapter [saves settings and renders a streamed response]', async ({ page }) => {
  await page.goto('/#/chat')
  await page.getByRole('link', { name: '全局设置' }).click()

  await page.getByLabel('Base URL').fill('https://example.test/v1')
  await page.getByLabel('API Key').fill('test-key')
  await page.getByLabel('模型名').fill('test-model')
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.goBack()

  await page.getByRole('button', { name: '新建' }).click()
  await page.getByLabel('消息内容').fill('Hello')
  await page.getByRole('button', { name: '发送' }).click()

  await expect(page.getByText('浏览器预览响应。')).toBeVisible()
})
