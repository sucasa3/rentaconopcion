import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

const DEEP_BLUE = '#1e3a5f'
const ORANGE = '#DA5431'
const MUTED = '#64748b'

interface Props {
  officerName?: string
  homeownerName?: string
  channel?: 'email' | 'phone'
  agentName?: string | null
}

const Email = ({ officerName, homeownerName, channel, agentName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{homeownerName ?? 'A homeowner'} asked to talk with you</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: '-apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '24px 20px' }}>
        <Heading style={{ fontSize: '22px', color: DEEP_BLUE }}>
          {homeownerName ?? 'A homeowner'} requested a mortgage conversation
        </Heading>
        <Text style={{ fontSize: '15px', lineHeight: '24px', color: '#0f172a' }}>
          Hi {officerName ?? 'there'}, a homeowner{agentName ? ` working with ${agentName}` : ''} asked
          SuCasa to put them in touch with you. They prefer to be contacted by {channel === 'phone' ? 'phone' : 'email'}.
        </Text>
        <Text style={{ fontSize: '13px', lineHeight: '20px', color: MUTED }}>
          This is a one-time request to talk — not permission for marketing or automated texts.
          Their contact details are in your SuCasa workspace.
        </Text>
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button
            href="https://sucasa.com/lender"
            style={{ backgroundColor: ORANGE, color: '#ffffff', borderRadius: '999px', padding: '12px 24px', fontWeight: 600, textDecoration: 'none' }}
          >
            Open SuCasa
          </Button>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `${d.homeownerName ?? 'A homeowner'} asked for a mortgage conversation`,
  displayName: 'Homeowner mortgage conversation request',
  previewData: { officerName: 'Dana', homeownerName: 'Maria Lopez', channel: 'email', agentName: 'Neil' },
} satisfies TemplateEntry
