import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const DEEP_BLUE = '#1e3a5f'
const GROWTH_GREEN = '#10b981'
const TEXT_MUTED = '#64748b'
const BORDER = '#e2e8f0'

export interface CampaignUpdateProps {
  /** Homeowner first name */
  firstName?: string
  /** Body copy generated for this homeowner (plain text, blank-line separated) */
  body?: string
  previewText?: string
  ctaLabel?: string
  ctaUrl?: string
  partnerName?: string
  contactName?: string
  contactTitle?: string
  contactPhone?: string
  replyTo?: string
  license?: string
  logoUrl?: string
  signoff?: string
  propertyAddress?: string
  propertyValue?: string
  equity?: string
  /** 1x1 open-tracking pixel URL (optional). */
  trackingPixelUrl?: string
}

const CampaignUpdateEmail = ({
  firstName,
  body,
  previewText,
  ctaLabel = 'See my home report',
  ctaUrl = 'https://rentaconopcion.lovable.app/dashboard',
  partnerName,
  contactName,
  contactTitle,
  contactPhone,
  replyTo,
  license,
  logoUrl,
  signoff = 'Talk soon,',
  propertyAddress,
  propertyValue,
  equity,
  trackingPixelUrl,
}: CampaignUpdateProps) => {
  const paragraphs = (body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const stats = [
    propertyValue ? { label: 'Estimated value', value: propertyValue } : null,
    equity ? { label: 'Your equity', value: equity } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{previewText || `An update on your home from ${partnerName ?? 'your loan officer'}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            {logoUrl ? (
              <Img src={logoUrl} alt={partnerName ?? 'Partner'} height="36" style={logo} />
            ) : (
              <Text style={brandText}>{partnerName ?? 'Your home update'}</Text>
            )}
          </Section>

          <Section style={content}>
            <Heading style={heading}>
              {firstName ? `Hi ${firstName},` : 'Hi there,'}
            </Heading>

            {paragraphs.length ? (
              paragraphs.map((p, i) => (
                <Text key={i} style={paragraph}>
                  {p}
                </Text>
              ))
            ) : (
              <Text style={paragraph}>
                Here is your latest home update. Open your home report to see the
                current numbers for your property.
              </Text>
            )}

            {propertyAddress ? <Text style={addressText}>{propertyAddress}</Text> : null}

            {stats.length ? (
              <Section style={statsBox}>
                {stats.map((s) => (
                  <Text key={s.label} style={statRow}>
                    <span style={statLabel}>{s.label}</span>
                    <span style={statValue}>{s.value}</span>
                  </Text>
                ))}
              </Section>
            ) : null}

            <Section style={ctaWrap}>
              <Button href={ctaUrl} style={button}>
                {ctaLabel}
              </Button>
            </Section>

            <Hr style={hr} />

            <Text style={signoffText}>{signoff}</Text>
            <Text style={signatureName}>{contactName || partnerName}</Text>
            {contactTitle ? <Text style={signatureLine}>{contactTitle}</Text> : null}
            {partnerName && contactName ? (
              <Text style={signatureLine}>{partnerName}</Text>
            ) : null}
            {contactPhone ? <Text style={signatureLine}>{contactPhone}</Text> : null}
            {replyTo ? (
              <Text style={signatureLine}>
                <Link href={`mailto:${replyTo}`} style={link}>
                  {replyTo}
                </Link>
              </Text>
            ) : null}
            {license ? <Text style={signatureMuted}>License {license}</Text> : null}
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              {partnerName
                ? `Sent by SuCasa on behalf of ${partnerName}.`
                : 'Sent by SuCasa.'}
            </Text>
            {trackingPixelUrl ? (
              <Img src={trackingPixelUrl} alt="" width="1" height="1" style={pixel} />
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CampaignUpdateEmail,
  subject: (data: Record<string, any>) =>
    (data['subject'] as string) || 'An update on your home',
  displayName: 'Homeowner campaign update',
  previewData: {
    firstName: 'Jose',
    subject: 'Your home gained $28,000 in value',
    body: 'Your home in Fort Worth is now estimated at $412,000 — about $28,000 more than last year.\n\nThat puts your equity near $173,000. If you have been thinking about a renovation or consolidating higher-rate debt, this is a good moment to look at your options.',
    ctaLabel: 'See my home report',
    ctaUrl: 'https://rentaconopcion.lovable.app/dashboard',
    partnerName: 'SuCasa Demo Lender',
    contactName: 'Neil Terc',
    contactTitle: 'Mortgage Loan Officer',
    contactPhone: '(817) 555-0134',
    replyTo: 'neil@sucasa.com',
    license: 'NMLS 123456',
    propertyAddress: '1010 Arbor Creek Dr, Fort Worth, TX',
    propertyValue: '$412,000',
    equity: '$173,000',
  },
} satisfies TemplateEntry

const pixel = { display: 'block', width: '1px', height: '1px', opacity: 0 }

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '24px 20px 32px',
}
const header = { paddingBottom: '16px' }
const logo = { display: 'block' }
const brandText = {
  margin: '0',
  fontSize: '15px',
  fontWeight: 700,
  color: DEEP_BLUE,
  letterSpacing: '0.2px',
}
const content = {
  border: `1px solid ${BORDER}`,
  borderRadius: '16px',
  padding: '28px 24px',
}
const heading = {
  margin: '0 0 14px',
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 700,
  color: DEEP_BLUE,
}
const paragraph = {
  margin: '0 0 14px',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#0f172a',
}
const addressText = {
  margin: '0 0 12px',
  fontSize: '13px',
  color: TEXT_MUTED,
}
const statsBox = {
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  padding: '12px 16px',
  margin: '0 0 20px',
  backgroundColor: '#f8fafc',
}
const statRow = {
  margin: '4px 0',
  fontSize: '14px',
  color: '#0f172a',
}
const statLabel = { color: TEXT_MUTED }
const statValue = { float: 'right' as const, fontWeight: 700, color: DEEP_BLUE }
const ctaWrap = { padding: '4px 0 8px' }
const button = {
  backgroundColor: GROWTH_GREEN,
  borderRadius: '999px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
}
const hr = { borderColor: BORDER, margin: '24px 0 16px' }
const signoffText = { margin: '0 0 8px', fontSize: '14px', color: '#0f172a' }
const signatureName = {
  margin: '0',
  fontSize: '14px',
  fontWeight: 700,
  color: DEEP_BLUE,
}
const signatureLine = { margin: '0', fontSize: '13px', color: '#0f172a' }
const signatureMuted = { margin: '4px 0 0', fontSize: '12px', color: TEXT_MUTED }
const link = { color: GROWTH_GREEN, textDecoration: 'none' }
const footer = { padding: '16px 4px 0' }
const footerText = { margin: '0', fontSize: '11px', color: TEXT_MUTED }
