import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { EmailBrand, bodyText, heading, mutedText } from './brand'

interface SecurityAlertEmailProps {
  /** "email address" / "phone number" — never the value itself. */
  changedWhat?: string
  changedAt?: string
  supportEmail?: string
  language?: 'en' | 'es'
}

/**
 * Sent to the account's PREVIOUS email address after a verified contact-detail
 * change completes. Deliberately contains no verification codes, no new
 * contact values, and no other account details.
 */
export const SecurityAlertEmail = ({
  changedWhat = 'contact information',
  changedAt = '',
  supportEmail = 'support@sucasa.com',
  language = 'en',
}: SecurityAlertEmailProps) => {
  if (language === 'es') {
    return (
      <EmailBrand preview="Se actualizó la información de contacto de tu cuenta SuCasa">
        <Heading style={heading}>Se actualizó tu información de contacto</Heading>
        <Text style={bodyText}>
          Te escribimos porque {changedWhat === 'phone number' ? 'el número de teléfono' : 'el correo electrónico'} de
          tu cuenta SuCasa se cambió{changedAt ? ` el ${changedAt}` : ''}.
        </Text>
        <Text style={bodyText}>
          Si hiciste este cambio, no necesitas hacer nada más.
        </Text>
        <Text style={bodyText}>
          Si no hiciste este cambio, escríbenos de inmediato a {supportEmail} y te ayudaremos a
          proteger tu cuenta.
        </Text>
        <Text style={mutedText}>
          Por seguridad, este mensaje no incluye códigos ni datos de tu cuenta.
        </Text>
      </EmailBrand>
    )
  }
  return (
    <EmailBrand preview="Your SuCasa contact information was changed">
      <Heading style={heading}>Your contact information was changed</Heading>
      <Text style={bodyText}>
        We're letting you know that the {changedWhat} on your SuCasa account was changed
        {changedAt ? ` on ${changedAt}` : ''}.
      </Text>
      <Text style={bodyText}>If you made this change, there's nothing else to do.</Text>
      <Text style={bodyText}>
        If you did not make this change, contact us right away at {supportEmail} and we'll help you
        secure your account.
      </Text>
      <Text style={mutedText}>
        For your security, this message contains no verification codes or account details.
      </Text>
    </EmailBrand>
  )
}

export const template = {
  component: SecurityAlertEmail,
  subject: 'Your SuCasa contact information was changed',
  displayName: 'Security alert — contact information changed',
  previewData: {
    changedWhat: 'phone number',
    changedAt: 'September 22, 2026',
    supportEmail: 'support@sucasa.com',
    language: 'en',
  },
}

export default SecurityAlertEmail
