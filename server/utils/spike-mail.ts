/**
 * ⚠️  SPIKE CODE — throwaway. Phase 1 §1.5.
 *
 * SMTP send. Locally this reaches Mailpit; deployed it will reach SES. The only
 * difference between the two is configuration, which is the point of ADR-005.
 *
 * Magic-link mail is load-bearing for sign-in (hard rule 9), so every send is
 * logged — a silent failure is a user who cannot log in and cannot tell you.
 */

import { createTransport } from 'nodemailer'
import type { Transporter } from 'nodemailer'

let transporter: Transporter | undefined

function mailer(): Transporter {
  if (transporter) return transporter

  const config = useRuntimeConfig()

  transporter = createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort),
    // Mailpit is a plain local trap: no credentials, no TLS. SES will need both,
    // which is a config change rather than a code change.
    secure: false,
    ignoreTLS: true,
  })

  return transporter
}

export async function sendMagicLink(to: string, link: string): Promise<void> {
  const config = useRuntimeConfig()

  try {
    const info = await mailer().sendMail({
      from: config.smtpFrom,
      to,
      subject: 'Your sign-in link',
      text: `Sign in by opening this link:\n\n${link}\n\nIt expires in 15 minutes and works once.`,
      html: `<p>Sign in by opening this link:</p><p><a href="${link}">${link}</a></p><p>It expires in 15 minutes and works once.</p>`,
    })

    console.info('[auth] magic link sent', { to, messageId: info.messageId })
  }
  catch (error) {
    // Loud on purpose. This is the failure mode that locks people out silently.
    console.error('[auth] MAGIC LINK SEND FAILED', { to, error })
    throw error
  }
}
