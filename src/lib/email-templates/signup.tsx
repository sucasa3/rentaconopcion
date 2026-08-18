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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailBrand preview="Confirm your email to start owning your home with confidence">
    <Heading style={heading}>Welcome to SuCasa</Heading>
    <Text style={bodyText}>
      Thanks for signing up. Please confirm your email address (
      <Link href={`mailto:${recipient}`} style={inlineLink}>
        {recipient}
      </Link>
      ) so we can build your personalized Home Record and keep your account
      secure.
    </Text>
    <Button style={primaryButton} href={confirmationUrl}>
      Verify Email
    </Button>
    <Text style={mutedText}>
      If you didn’t create a SuCasa account, you can safely ignore this email.
    </Text>
  </EmailBrand>
)

export default SignupEmail
