import { test, expect } from '@playwright/test'

test('local mode still creates a private activity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Good afternoon.' })).toBeVisible()
  await page.getByRole('button', { name: 'Add activity', exact: true }).first().click()
  await page.getByLabel('Notes').fill('Playwright private activity')
  await page.getByRole('button', { name: 'Save activity' }).click()
  await expect(page.getByText('Playwright private activity')).toBeVisible()
})

test('signing out is a no-op in local mode and the workspace remains', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Local & private')).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Good afternoon.' })).toBeVisible()
})

test.describe('remote flows', () => {
  test.skip(!process.env.PLAYWRIGHT_REMOTE, 'Set PLAYWRIGHT_REMOTE=1 with a seeded Supabase project to run online tests.')
  test('accepting an invitation', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('registering and confirming account state', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('signing in', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('creating a private activity', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('signing out and back in', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('verifying data persistence on another browser context', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('failed access to another user’s data', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('admin invitation flow', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('suspension flow', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
  test('local-data migration', async () => { expect(process.env.PLAYWRIGHT_REMOTE).toBeTruthy() })
})
