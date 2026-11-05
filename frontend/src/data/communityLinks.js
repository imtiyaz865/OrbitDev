import { Instagram, Linkedin, MessageCircle } from 'lucide-react'

export const communityLinks = [
  { name: 'WhatsApp', url: 'https://whatsapp.com/channel/0029Vb8JGaE4Y9lmTi3xB117', Icon: MessageCircle },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/company/theorbitcommunity', Icon: Linkedin },
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
