import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { EmailBrand, bodyText, heading, mutedText, primaryButton } from './brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <EmailBrand preview="Your secure SuCasa login link">
    <Heading style={heading}>Log in to SuCasa</Heading>
    <Text style={bodyText}>
      Click the button below to log in securely. This link will expire shortly
      and can only be used once.
    </Text>
    <Button style={primaryButton} href={confirmationUrl}>
      Log In
    </Button>
    <Text style={mutedText}>
      If you didn’t request this link, you can safely ignore this email.
    </Text>
  </EmailBrand>
)

export default MagicLinkEmail
