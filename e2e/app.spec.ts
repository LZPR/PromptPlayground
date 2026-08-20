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
