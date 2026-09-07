import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailBrand, bodyText, heading, mutedText, primaryButton } from './brand'

export interface AgentInviteProps {
  /** Name of the agent being invited, when known. */
  agentName?: string
  /** Lender organization extending the invitation. */
  lenderName?: string
  /** Person who sent the invitation. */
  inviterName?: string
  /** Optional personal note written by the inviter. */
  message?: string
  acceptUrl?: string
}

const AgentInviteEmail = ({
  agentName,
  lenderName = 'A lender on SuCasa',
  inviterName,
  message,
  acceptUrl = 'https://rentaconopcion.lovable.app/agent/network',
}: AgentInviteProps) => (
  <EmailBrand preview={`${lenderName} invited you to connect on SuCasa`}>
    <Heading style={heading}>You've been invited to connect</Heading>
    <Text style={bodyText}>
      {agentName ? `Hi ${agentName.split(' ')[0]},` : 'Hi there,'}
    </Text>
    <Text style={bodyText}>
      <strong>{lenderName}</strong>
      {inviterName ? ` (${inviterName})` : ''} invited you to connect on SuCasa. Connecting
      lets you collaborate on homeowner opportunities and share client intelligence, with
      each side keeping control of its own records.
    </Text>
    {message ? <Text style={quote}>“{message}”</Text> : null}
    <Button style={primaryButton} href={acceptUrl}>
      Review invitation
    </Button>
    <Text style={mutedText}>
      Sign in to SuCasa with this email address to accept or decline. If you weren't
      expecting this invitation, you can safely ignore this email.
    </Text>
  </EmailBrand>
)

const quote = {
  ...bodyText,
  borderLeft: '3px solid #10b981',
  paddingLeft: '14px',
  fontStyle: 'italic' as const,
  color: '#334155',
}

export const template = {
  component: AgentInviteEmail,
  subject: (data: Record<string, any>) =>
    `${data['lenderName'] ?? 'A lender'} invited you to connect on SuCasa`,
  displayName: 'Agent invitation',
  previewData: {
    agentName: 'Jordan Reyes',
    lenderName: 'SuCasa Demo Lender',
    inviterName: 'Neil Terc',
    message: 'Would love to work your referrals together.',
  },
} satisfies TemplateEntry

export default AgentInviteEmail
