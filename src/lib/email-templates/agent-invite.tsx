import * as React from 'react'
import { Button, Heading, Hr, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import {
  EmailBrand,
  bodyText,
  brandColors,
  eyebrow,
  hairlineRule,
  heading,
  mutedText,
  primaryButton,
} from './brand'

export interface AgentInviteProps {
  /** Name of the agent being invited, when known. */
  agentName?: string
  /** Lender organization extending the invitation. */
  lenderName?: string
  /** Person who sent the invitation. */
  inviterName?: string
  /** Optional personal note written by the inviter. */
  message?: string
  /** True when the lender is covering the agent's SuCasa access. */
  sponsored?: boolean
  acceptUrl?: string
}

const BENEFITS: { title: string; detail: string }[] = [
  {
    title: 'Know who to contact today',
    detail: 'SuCasa reviews your past clients and tells you who may be worth a call.',
  },
  {
    title: 'See opportunities earlier',
    detail: 'Equity, tenure and home-condition signals surface before someone calls a competitor.',
  },
  {
    title: 'Always have something useful to say',
    detail: 'Every homeowner comes with context and a suggested way to open the conversation.',
  },
]

const AgentInviteEmail = ({
  agentName,
  lenderName = 'A lender on SuCasa',
  inviterName,
  message,
  sponsored,
  acceptUrl = 'https://rentaconopcion.lovable.app/agent-invite',
}: AgentInviteProps) => (
  <EmailBrand preview={`${lenderName} is giving you access to SuCasa`}>
    <Text style={eyebrow}>Invited by {lenderName}</Text>
    <Heading style={heading}>Your database is about to get smarter.</Heading>
    <Text style={bodyText}>
      {agentName ? `Hi ${agentName.split(' ')[0]},` : 'Hi there,'}
    </Text>
    <Text style={bodyText}>
      <strong>{lenderName}</strong>
      {inviterName ? ` (${inviterName})` : ''} invited you to SuCasa — a relationship
      operating system that watches your past clients and tells you who may deserve your
      attention, and why.
    </Text>

    {message ? <Text style={quote}>“{message}”</Text> : null}

    <Hr style={hairlineRule} />

    {BENEFITS.map((b) => (
      <Section key={b.title} style={benefitRow}>
        <Text style={benefitTitle}>{b.title}</Text>
        <Text style={benefitDetail}>{b.detail}</Text>
      </Section>
    ))}

    <Hr style={hairlineRule} />

    <Button style={primaryButton} href={acceptUrl}>
      Accept invitation
    </Button>
    <Text style={afterButton}>Takes about 60 seconds.</Text>

    <Text style={mutedText}>
      {sponsored
        ? `${lenderName} is covering your SuCasa access. You keep your own clients and your own records — nothing is shared without permission.`
        : 'You keep your own clients and your own records — nothing is shared without permission.'}
    </Text>
    <Text style={mutedText}>
      This invitation link expires in 21 days and only works for the email address it was
      sent to. If you weren’t expecting it, you can ignore this email.
    </Text>
  </EmailBrand>
)

const quote = {
  ...bodyText,
  borderLeft: `3px solid ${brandColors.NAVY}`,
  paddingLeft: '14px',
  fontStyle: 'italic' as const,
  margin: '0 0 20px',
}

const benefitRow = { margin: '0 0 18px' }

const benefitTitle = {
  fontSize: '15px',
  fontWeight: '700',
  color: brandColors.CHARCOAL,
  margin: '0 0 4px',
  lineHeight: '1.4',
}

const benefitDetail = {
  fontSize: '14px',
  color: brandColors.TEXT_BODY,
  lineHeight: '1.6',
  margin: '0',
}

const afterButton = {
  fontSize: '13px',
  color: brandColors.TEXT_MUTED,
  margin: '12px 0 0',
}

export const template = {
  component: AgentInviteEmail,
  subject: (data: Record<string, any>) =>
    `${data['lenderName'] ?? 'A lender'} invited you to SuCasa`,
  displayName: 'Agent invitation',
  previewData: {
    agentName: 'Jordan Reyes',
    lenderName: 'SuCasa Demo Lender',
    inviterName: 'Neil Terc',
    message: 'Would love to work your referrals together.',
    sponsored: true,
  },
} satisfies TemplateEntry

export default AgentInviteEmail
