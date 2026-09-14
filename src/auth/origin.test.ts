import { describe, expect, it } from 'vitest'
import { authRedirectUrl, getAppOrigin, safeInternalPath } from './origin'

describe('application origin', () => {
  it('does not hard-code a production host', () => {
    expect(getAppOrigin()).not.toMatch(/vercel\.app/)
    expect(authRedirectUrl('/auth/callback').endsWith('/auth/callback')).toBe(true)
  })

  it('rejects open redirects', () => {
    expect(safeInternalPath('https://evil.example/phish')).toBe('/')
    expect(safeInternalPath('//evil.example')).toBe('/')
    expect(safeInternalPath('\\evil')).toBe('/')
    expect(safeInternalPath('/auth/reset-password')).toBe('/auth/reset-password')
    expect(safeInternalPath('/account?tab=security')).toBe('/account?tab=security')
  })
})
