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

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailBrand preview="Confirm your SuCasa email change">
    <Heading style={heading}>Confirm your email change</Heading>
    <Text style={bodyText}>
      You requested to change your SuCasa email address from{' '}
      <Link href={`mailto:${oldEmail}`} style={inlineLink}>
        {oldEmail}
      </Link>{' '}
      to{' '}
      <Link href={`mailto:${newEmail}`} style={inlineLink}>
        {newEmail}
      </Link>
      .
    </Text>
    <Text style={bodyText}>Click the button below to confirm this change:</Text>
    <Button style={primaryButton} href={confirmationUrl}>
      Confirm Email Change
    </Button>
    <Text style={mutedText}>
      If you didn’t request this change, please secure your account immediately.
    </Text>
  </EmailBrand>
)

export default EmailChangeEmail
