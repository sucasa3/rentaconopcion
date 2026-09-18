import * as React from 'react'
import { Button, Heading, Text } from '@react-email/components'
import { EmailBrand, bodyText, heading, mutedText, primaryButton } from './brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
  language?: 'en' | 'es'
}

export const MagicLinkEmail = ({
  confirmationUrl,
  language = 'en',
}: MagicLinkEmailProps) => {
  if (language === 'es') {
    return (
      <EmailBrand preview="Tu enlace seguro para iniciar sesión en SuCasa">
        <Heading style={heading}>Inicia sesión en SuCasa</Heading>
        <Text style={bodyText}>
          Haz clic en el botón para iniciar sesión de forma segura. Este enlace
          caducará pronto y solo puede usarse una vez.
        </Text>
        <Button style={primaryButton} href={confirmationUrl}>
          Iniciar sesión
        </Button>
        <Text style={mutedText}>
          Si no solicitaste este enlace, puedes ignorar este correo.
        </Text>
      </EmailBrand>
    )
  }
  return (
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
}

export default MagicLinkEmail
