import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import logoAsset from '@/assets/sucasa-logo.png.asset.json'

interface EmailBrandProps {
  preview: string
  children: React.ReactNode
}

const SITE_NAME = 'SuCasa'
const ROOT_DOMAIN = 'sucasa.com'
const SITE_URL = `https://${ROOT_DOMAIN}`

/**
 * Emails cannot resolve relative asset paths, so the hosted logo is pinned to
 * an absolute origin. Alt text carries the brand when images are blocked.
 */
const ASSET_ORIGIN =
  process.env['SITE_URL'] ?? 'https://rentaconopcion.lovable.app'
export const LOGO_URL = logoAsset.url.startsWith('http')
  ? logoAsset.url
  : `${ASSET_ORIGIN}${logoAsset.url}`

// SuCasa brand (email-safe hex equivalents of the app design tokens)
const NAVY = '#1E3A5F'
const CHARCOAL = '#1F2937'
const WARM_BG = '#FAF8F5'
const HAIRLINE = '#ECE7E1'
const TEXT_BODY = '#3F4550'
const TEXT_MUTED = '#7A8290'

export const EmailBrand = ({ preview, children }: EmailBrandProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      {/* Keep clients from auto-inverting the charcoal wordmark in dark mode. */}
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Link href={SITE_URL} style={logoLink}>
            <Img src={LOGO_URL} width="112" height="24" alt="SuCasa" style={logoImg} />
          </Link>
        </Section>

        <Section style={content}>{children}</Section>

        <Section style={footer}>
          <Text style={footerText}>
            You’re receiving this email because you have a SuCasa account or
            were invited to join.
          </Text>
          <Text style={footerLinks}>
            <Link href={SITE_URL} style={footerLink}>
              sucasa.com
            </Link>
            {' · '}
            <Link href={`${SITE_URL}/support`} style={footerLink}>
              Support
            </Link>
          </Text>
          <Text style={footerAddress}>
            © {new Date().getFullYear()} {SITE_NAME}. The trusted operating
            system for homeownership.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: WARM_BG,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '24px 12px',
}

const container = {
  backgroundColor: '#ffffff',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: '14px',
  margin: '0 auto',
  maxWidth: '520px',
  overflow: 'hidden',
  padding: '0',
}

const header = {
  backgroundColor: '#ffffff',
  borderBottom: `1px solid ${HAIRLINE}`,
  padding: '22px 32px',
}

const logoLink = {
  color: CHARCOAL,
  textDecoration: 'none',
  fontSize: '18px',
  fontWeight: '700',
  letterSpacing: '-0.02em',
}

const logoImg = {
  display: 'block',
  height: 'auto',
  maxWidth: '112px',
}

const content = {
  padding: '32px',
}

const footer = {
  backgroundColor: WARM_BG,
  borderTop: `1px solid ${HAIRLINE}`,
  padding: '22px 32px',
  textAlign: 'center' as const,
}

const footerText = {
  fontSize: '12px',
  color: TEXT_MUTED,
  lineHeight: '1.5',
  margin: '0 0 10px',
}

const footerLinks = {
  fontSize: '12px',
  color: TEXT_MUTED,
  margin: '0 0 10px',
}

const footerLink = {
  color: NAVY,
  fontWeight: '600',
  textDecoration: 'none',
}

const footerAddress = {
  fontSize: '11px',
  color: '#A0A7B2',
  margin: '0',
}

export const heading = {
  fontSize: '26px',
  fontWeight: '700',
  color: CHARCOAL,
  lineHeight: '1.22',
  letterSpacing: '-0.02em',
  margin: '0 0 16px',
}

export const bodyText = {
  fontSize: '16px',
  color: TEXT_BODY,
  lineHeight: '1.65',
  margin: '0 0 20px',
}

export const primaryButton = {
  backgroundColor: NAVY,
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  borderRadius: '10px',
  padding: '15px 30px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const mutedText = {
  fontSize: '13px',
  color: TEXT_MUTED,
  lineHeight: '1.6',
  margin: '24px 0 0',
}

export const inlineLink = {
  color: NAVY,
  fontWeight: '600',
  textDecoration: 'underline',
}

export const hairlineRule = {
  border: 'none',
  borderTop: `1px solid ${HAIRLINE}`,
  margin: '28px 0',
}

export const eyebrow = {
  fontSize: '12px',
  fontWeight: '700',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: TEXT_MUTED,
  margin: '0 0 10px',
}

export const codeBox = {
  backgroundColor: WARM_BG,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: '10px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '22px',
  fontWeight: '700',
  color: CHARCOAL,
  letterSpacing: '0.15em',
  padding: '16px 24px',
  textAlign: 'center' as const,
  margin: '8px 0 24px',
}

export const brandColors = { NAVY, CHARCOAL, WARM_BG, HAIRLINE, TEXT_BODY, TEXT_MUTED }
