import * as React from 'react'
import { Button, Heading, Link, Text } from '@react-email/components'
import {
  EmailBrand,
  bodyText,
  heading,
  inlineLink,
  mutedText,
  primaryButton,
} from './brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <EmailBrand preview="You've been invited to join SuCasa">
    <Heading style={heading}>You've been invited</Heading>
    <Text style={bodyText}>
      You’ve been invited to join{' '}
      <Link href="https://sucasa.com" style={inlineLink}>
        <strong>SuCasa</strong>
      </Link>
      . Accept the invitation to create your account and start managing your home
      with confidence.
    </Text>
    <Button style={primaryButton} href={confirmationUrl}>
      Accept Invitation
    </Button>
    <Text style={mutedText}>
      If you weren’t expecting this invitation, you can safely ignore this email.
    </Text>
  </EmailBrand>
)

export default InviteEmail
