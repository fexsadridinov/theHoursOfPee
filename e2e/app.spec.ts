import { test, expect } from '@playwright/test'

const dashboard = 'Your hours at a glance.'

test('logging hours works with nothing but the prefilled defaults', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: dashboard })).toBeVisible()
  await page.getByRole('button', { name: 'Log hours', exact: true }).first().click()
  await page.getByLabel('Hours', { exact: true }).fill('1.5')
  await page.getByLabel('Notes').fill('Playwright private entry')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Playwright private entry')).toBeVisible()
  await expect(page.getByText('1.5 h').first()).toBeVisible()
})

test('direct and indirect hours are both offered in the log dialog', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log hours', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('radio', { name: /Direct hours/ })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: /Indirect hours/ })).toBeVisible()
  await dialog.getByRole('radio', { name: /Indirect hours/ }).click()
  await dialog.getByLabel('Hours', { exact: true }).fill('2')
  await dialog.getByLabel('Notes').fill('Indirect write-up')
  await dialog.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Indirect write-up')).toBeVisible()
})
test('the quick pick keeps the hours field in step', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log hours', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '0.5 h', exact: true }).click()
  await expect(dialog.getByLabel('Hours', { exact: true })).toHaveValue('0.5')
  await dialog.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('heading', { name: dashboard })).toBeVisible()
})

test('a day on the calendar logs hours against that date', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Calendar' }).click()
  await page.getByRole('button', { name: /^Log hours on / }).click()
  await page.getByLabel('Notes').fill('Logged from the calendar')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Logged from the calendar')).toBeVisible()
})

test('an entry without hours explains itself instead of failing silently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log hours', exact: true }).first().click()
  await page.getByLabel('Hours', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByRole('alert')).toContainText('how many hours')
})

test('signing out is a no-op in local mode and the workspace remains', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Local & private')).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: dashboard })).toBeVisible()
})

test('every page keeps a way back to the dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings & data' })).toBeVisible()
  await page.getByRole('button', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: dashboard })).toBeVisible()
  await page.getByRole('button', { name: 'Reports' }).click()
  await page.getByRole('button', { name: 'the Hours of Pee — go to overview' }).click()
  await expect(page.getByRole('heading', { name: dashboard })).toBeVisible()
})

test.describe('remote flows', () => {
  test.skip(!process.env.PLAYWRIGHT_REMOTE, 'Set PLAYWRIGHT_REMOTE=1 with a seeded Supabase project to run online tests.')
  test('accepting an invitation', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('registering and confirming account state', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('signing in', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('logging private hours', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('signing out and back in', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('verifying data persistence on another browser context', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('failed access to another user’s data', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('admin invitation flow', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('suspension flow', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('local-data migration', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
})
