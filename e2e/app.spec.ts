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

  await page.getByRole('button', { name: '会话', exact: true }).click()
  await expect(page.getByRole('heading', { name: '会话' })).toBeVisible()
  await expect(page).toHaveURL(/#\/chat$/)
  const sidebarWidth = await page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().width)
  expect(sidebarWidth / (await page.viewportSize())!.width).toBeGreaterThan(0.32)
  expect(sidebarWidth / (await page.viewportSize())!.width).toBeLessThan(0.34)

  await page.getByRole('button', { name: '收起侧栏' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--collapsed/)
  await expect(page.locator('.sidebar').getByRole('button')).toHaveCount(1)
  await expect(page.locator('.sidebar').getByRole('link', { name: '全局设置' })).toHaveCount(0)
  await expect(page.locator('.sidebar')).toHaveCSS('border-right-width', '0px')

  await page.getByRole('button', { name: '展开侧栏' }).click()
  await page.getByRole('button', { name: '分支', exact: true }).click()
  await expect(page.getByRole('heading', { name: '分支' })).toBeVisible()
  await page.getByRole('button', { name: '全屏侧栏' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--fullscreen/)
  await expect(page.locator('.chat-view')).toBeAttached()
  await page.getByRole('link', { name: '全局设置' }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.getByRole('heading', { name: '全局设置' })).toBeVisible()
  await expect(page.locator('.chat-view')).toBeHidden()
})

test('[workspace sidebar] narrow screen [opens the overlay panel]', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/#/chat')

  await page.getByRole('button', { name: '打开工作侧栏' }).click()
  await expect(page.getByRole('complementary', { name: '工作侧栏' })).toBeVisible()
  const sidebarWidth = await page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().width)
  expect(sidebarWidth / 375).toBeGreaterThan(0.32)
  expect(sidebarWidth / 375).toBeLessThan(0.34)
  await expect(page.getByRole('heading', { name: '聊天' })).toBeVisible()
  await page.getByRole('button', { name: '分支', exact: true }).click()
  await expect(page.getByRole('heading', { name: '分支' })).toBeVisible()
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

  await page.locator('.chat-empty').getByRole('button', { name: '新建会话' }).click()
  await page.getByRole('button', { name: '添加新消息' }).click()
  await expect(page.getByRole('menuitem', { name: '在开头添加消息' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '在末尾添加消息' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '更多聊天操作' }).click()
  await expect(page.getByRole('menuitem', { name: '继续生成' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '重新生成' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('请输入消息内容', { exact: true })).toHaveCount(0)
  const [inputBox, sendBox] = await Promise.all([
    page.getByLabel('消息内容').boundingBox(),
    page.getByRole('button', { name: '发送' }).boundingBox()
  ])
  expect(inputBox).not.toBeNull()
  expect(sendBox).not.toBeNull()
  expect(sendBox!.x).toBeGreaterThan(inputBox!.x)
  await page.getByLabel('消息内容').fill('Hello')
  await page.getByRole('button', { name: '发送' }).click()

  await expect(page.getByText('浏览器预览响应。')).toBeVisible()
})

test('[branch tree] root fork [shows the virtual root and protects it from deletion]', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByLabel('Base URL').fill('https://example.test/v1')
  await page.getByLabel('API Key').fill('test-key')
  await page.getByLabel('模型名').fill('test-model')
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.goto('/#/chat')

  await page.locator('.chat-empty').getByRole('button', { name: '新建会话' }).click()
  await page.getByLabel('消息内容').fill('First branch')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('浏览器预览响应。')).toBeVisible()
  const firstMessage = page.locator('.chat-message--user').first()
  await firstMessage.hover()
  await firstMessage.getByRole('button', { name: '消息更多操作' }).click()
  await page.getByRole('menuitem', { name: '修改' }).click()
  await page.getByLabel('编辑消息内容').fill('First branch alternative')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('button', { name: '展开侧栏' }).click()
  await page.getByRole('button', { name: '分支', exact: true }).click()
  await expect(page.getByText('起始分支', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '展开分支' }).click()
  await expect(page.getByRole('button', { name: 'First branch', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'First branch alterna', exact: true })).toBeVisible()

  const root = page.locator('.branch-tree__root')
  await root.getByRole('button', { name: '分支更多操作' }).click()
  await expect(page.getByRole('menuitem', { name: '删除分支' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const child = page.locator('.branch-tree li:not(.branch-tree__root)').last()
  await child.getByRole('button', { name: '分支更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除分支' }).click()
  await expect(page.getByRole('heading', { name: '删除分支' })).toBeVisible()
})
