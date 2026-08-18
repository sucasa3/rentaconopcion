import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface EmailBrandProps {
  preview: string
  children: React.ReactNode
}

const SITE_NAME = 'SuCasa'
const ROOT_DOMAIN = 'sucasa.com'
const SITE_URL = `https://${ROOT_DOMAIN}`

// SuCasa brand colors (approximate hex equivalents of design tokens)
const DEEP_BLUE = '#1e3a5f'
const GROWTH_GREEN = '#10b981'
const SOFT_GRAY = '#f8fafc'
const TEXT_MUTED = '#64748b'

export const EmailBrand = ({ preview, children }: EmailBrandProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Link href={SITE_URL} style={logoLink}>
            <span style={logoIcon} aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                <path
                  d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75h-6a.75.75 0 01-.75-.75v-5.25h-3V21a.75.75 0 01-.75.75h-6a.75.75 0 01-.75-.75V9.75z"
                  fill={GROWTH_GREEN}
                />
                <path
                  d="M12 3L3 9.75V21a.75.75 0 00.75.75h6a.75.75 0 00.75-.75v-5.25h3V21a.75.75 0 00.75.75h6A.75.75 0 0021 21V9.75L12 3z"
                  stroke={DEEP_BLUE}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </span>
            <span style={logoText}>{SITE_NAME}</span>
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
            © {new Date().getFullYear()} SuCasa. The trusted operating system
            for homeownership.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: SOFT_GRAY,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '32px 16px',
}

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  boxShadow: '0 4px 24px rgba(30, 58, 95, 0.08)',
  margin: '0 auto',
  maxWidth: '480px',
  overflow: 'hidden',
  padding: '0',
}

const header = {
  backgroundColor: DEEP_BLUE,
  padding: '24px 32px',
}

const logoLink = {
  color: '#ffffff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  textDecoration: 'none',
}

const logoIcon = {
  display: 'inline-block',
  width: '28px',
  height: '28px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '4px',
  boxSizing: 'border-box' as const,
}

const logoText = {
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '-0.02em',
}

const content = {
  padding: '32px',
}

const footer = {
  backgroundColor: SOFT_GRAY,
  padding: '24px 32px',
  textAlign: 'center' as const,
}

const footerText = {
  fontSize: '12px',
  color: TEXT_MUTED,
  lineHeight: '1.5',
  margin: '0 0 12px',
}

const footerLinks = {
  fontSize: '12px',
  color: TEXT_MUTED,
  margin: '0 0 12px',
}

const footerLink = {
  color: DEEP_BLUE,
  fontWeight: '600',
  textDecoration: 'none',
}

const footerAddress = {
  fontSize: '11px',
  color: '#94a3b8',
  margin: '0',
}

export const heading = {
  fontSize: '24px',
  fontWeight: '700',
  color: DEEP_BLUE,
  lineHeight: '1.25',
  margin: '0 0 16px',
}

export const bodyText = {
  fontSize: '15px',
  color: '#334155',
  lineHeight: '1.6',
  margin: '0 0 20px',
}

export const primaryButton = {
  backgroundColor: GROWTH_GREEN,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600',
  borderRadius: '10px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const mutedText = {
  fontSize: '13px',
  color: TEXT_MUTED,
  lineHeight: '1.5',
  margin: '24px 0 0',
}

export const inlineLink = {
  color: DEEP_BLUE,
  fontWeight: '600',
  textDecoration: 'underline',
}

export const codeBox = {
  backgroundColor: SOFT_GRAY,
  border: `1px solid #e2e8f0`,
  borderRadius: '10px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '22px',
  fontWeight: '700',
  color: DEEP_BLUE,
  letterSpacing: '0.15em',
  padding: '16px 24px',
  textAlign: 'center' as const,
  margin: '8px 0 24px',
}
