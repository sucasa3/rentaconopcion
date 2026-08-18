import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { EmailBrand, bodyText, codeBox, heading, mutedText } from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({
  token,
}: ReauthenticationEmailProps) => (
  <EmailBrand preview="Your SuCasa verification code">
    <Heading style={heading}>Confirm your identity</Heading>
    <Text style={bodyText}>
      Use the verification code below to complete your sign-in. It will expire
      shortly.
    </Text>
    <Text style={codeBox}>{token}</Text>
    <Text style={mutedText}>
      If you didn’t request this code, you can safely ignore this email.
    </Text>
  </EmailBrand>
)

export default ReauthenticationEmail
