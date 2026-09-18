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
  language?: 'en' | 'es'
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
  language = 'en',
}: EmailChangeEmailProps) => {
  if (language === 'es') {
    return (
      <EmailBrand preview="Confirma el cambio de correo de tu cuenta SuCasa">
        <Heading style={heading}>Confirma tu cambio de correo</Heading>
        <Text style={bodyText}>
          Solicitaste cambiar el correo de tu cuenta SuCasa de{' '}
          <Link href={`mailto:${oldEmail}`} style={inlineLink}>
            {oldEmail}
          </Link>{' '}
          a{' '}
          <Link href={`mailto:${newEmail}`} style={inlineLink}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={bodyText}>Haz clic en el botón para confirmar este cambio:</Text>
        <Button style={primaryButton} href={confirmationUrl}>
          Confirmar cambio de correo
        </Button>
        <Text style={mutedText}>
          Si no solicitaste este cambio, asegura tu cuenta de inmediato.
        </Text>
      </EmailBrand>
    )
  }
  return (
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
}

export default EmailChangeEmail
