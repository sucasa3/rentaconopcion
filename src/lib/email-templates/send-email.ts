import * as React from 'react'
import { render } from '@react-email/render'
import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js'
import { TEMPLATES } from './registry'

// Server-only: reads LOVABLE_API_KEY. Never import from client components.

// Configuration baked in at scaffold time
const SITE_NAME = "SuCasa Home Hub"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers. NEVER use the root domain.
const SENDER_DOMAIN = "notify.sucasa.com"
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// Can be the root domain when display_from_root is enabled — this is cosmetic only.
const FROM_DOMAIN = "notify.sucasa.com"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' | 'contact_preference' }

export interface SendTemplateEmailOptions {
  /**
   * Required. 'transactional' = codes, security notices, receipts and updates
   * about something the person started. 'marketing' = campaigns, nurture,
   * introductions, digests and any other relationship-building message.
   * Marketing always passes through the messaging policy first.
   */
  purpose: import('@/lib/messaging-policy.server').MessagePurpose
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
  /** Display name shown in the From: header (partner/MLO identity). */
  fromName?: string
  /** Recipient account id, when known — sharpens the preference lookup. */
  recipientUserId?: string | null
  /** Secondary matching factors for the suppression register. */
  recipientPhone?: string | null
  recipientStreet?: string | null
  recipientZip?: string | null
}

/**
 * Renders a registered template and sends it through Lovable's managed email
 * API. Every call declares a purpose; marketing and relationship email is
 * checked against the suppression register and the person's own preferences
 * before anything is sent, and gets a working one-click unsubscribe link.
 * Suppression, retries, and rate limits are also enforced by Lovable
 * server-side. A blocked recipient is an expected outcome ({ sent: false });
 * any other failure throws — EmailAPIError exposes .code and .status.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions
): Promise<SendTemplateEmailResult> {
  // Purpose first: a send with no declared purpose is a programming error and
  // must fail the same way in every environment.
  if (!options?.purpose) {
    throw new Error('sendTemplateEmail requires a declared message purpose')
  }

  const apiKey = process.env['LOVABLE_API_KEY']
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = { ...(options.templateData ?? {}) }

  if (options.purpose === 'marketing') {
    // Checked at send time, so a message queued before an opt-out is dropped.
    const { assertSendAllowed } = await import('@/lib/messaging-policy.server')
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const decision = await assertSendAllowed(supabaseAdmin, {
      purpose: 'marketing',
      channel: 'email',
      email: recipient,
      phone: options.recipientPhone ?? null,
      street: options.recipientStreet ?? null,
      zip: options.recipientZip ?? null,
      userId: options.recipientUserId ?? null,
    })
    if (!decision.allowed) return { sent: false, reason: 'contact_preference' }

    const { unsubscribeUrl } = await import('@/lib/unsubscribe.server')
    templateData['unsubscribeUrl'] = unsubscribeUrl(recipient)
  }

  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  try {
    await sendLovableEmail(
      {
        to: recipient,
        from: `${(options.fromName || SITE_NAME).replace(/[<>"\r\n]/g, '').trim() || SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: options.idempotencyKey || crypto.randomUUID(),
        reply_to: options.replyTo,
      },
      { apiKey, sendUrl: process.env['LOVABLE_SEND_URL'] }
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      return { sent: false, reason: 'recipient_suppressed' }
    }
    throw error
  }

  return { sent: true }
}
