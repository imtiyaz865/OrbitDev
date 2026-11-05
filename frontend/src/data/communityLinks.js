import { Instagram, Linkedin, MessageCircle } from 'lucide-react'

export const communityLinks = [
  { name: 'WhatsApp', url: import.meta.env.VITE_ORBIT_WHATSAPP_URL, Icon: MessageCircle },
  { name: 'LinkedIn', url: import.meta.env.VITE_ORBIT_LINKEDIN_URL, Icon: Linkedin },
  { name: 'Instagram', url: import.meta.env.VITE_ORBIT_INSTAGRAM_URL, Icon: Instagram },
]

export function validExternalUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
