import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const env = (key: string) => (Deno.env.get(key) ?? '').trim()

export const fromAddress = () => env('INVITE_FROM_EMAIL') || env('SMTP_USERNAME')

// SMTP is used so invitations come from a normal mailbox (for example a Gmail address with an app password).
export const mailConfigured = () => Boolean(env('SMTP_PASSWORD') && fromAddress())

export const sendMail = async (to: string, subject: string, text: string) => {
  if (!mailConfigured()) return false
  const port = Number(env('SMTP_PORT') || 465)
  const client = new SMTPClient({
    connection: {
      hostname: env('SMTP_HOST') || 'smtp.gmail.com',
      port,
      tls: port !== 587,
      auth: { username: env('SMTP_USERNAME') || fromAddress(), password: env('SMTP_PASSWORD') },
    },
  })
  try {
    await client.send({ from: fromAddress(), to, subject, content: text })
    return true
  } catch {
    return false
  } finally {
    try { await client.close() } catch { /* connection already closed */ }
  }
}

// Readable one-time password: no ambiguous characters, never logged or returned to the browser.
export const oneTimePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('')
}
