import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { EmailBrand, bodyText, heading, mutedText, primaryButton } from './brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  confirmationUrl,
}: RecoveryEmailProps) => (
  <EmailBrand preview="Reset your SuCasa password">
    <Heading style={heading}>Reset your password</Heading>
    <Text style={bodyText}>
      We received a request to reset your SuCasa password. Click the button
      below to choose a new one.
    </Text>
    <Button style={primaryButton} href={confirmationUrl}>
      Reset Password
    </Button>
    <Text style={mutedText}>
      If you didn’t request a password reset, you can safely ignore this email.
      Your password will not be changed.
    </Text>
  </EmailBrand>
)

export default RecoveryEmail
