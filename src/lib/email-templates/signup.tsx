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
  language?: 'en' | 'es'
}

export const SignupEmail = ({
  recipient,
  confirmationUrl,
  language = 'en',
}: SignupEmailProps) => {
  if (language === 'es') {
    return (
      <EmailBrand preview="Confirma tu correo para empezar a cuidar tu casa con confianza">
        <Heading style={heading}>Bienvenido a SuCasa</Heading>
        <Text style={bodyText}>
          Gracias por registrarte. Confirma tu correo electrónico (
          <Link href={`mailto:${recipient}`} style={inlineLink}>
            {recipient}
          </Link>
          ) para que podamos crear tu Registro de Casa personalizado y mantener
          tu cuenta segura.
        </Text>
        <Button style={primaryButton} href={confirmationUrl}>
          Verificar correo
        </Button>
        <Text style={mutedText}>
          Si no creaste una cuenta de SuCasa, puedes ignorar este correo.
        </Text>
      </EmailBrand>
    )
  }
  return (
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
}

export default SignupEmail
