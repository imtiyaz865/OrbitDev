import { Sparkles } from 'lucide-react'
import { eventTypeOrigin } from '../../utils/eventType.js'
import { registrationStatusOrigin } from '../../utils/registrationStatus.js'

/**
 * A one-line note under a dropdown saying how its value was set automatically,
 * e.g. "AI suggested — 82% confidence". Nothing is shown once the administrator
 * picks a value themselves (provenance becomes "manual" / "manually_edited").
 */
export function FieldOrigin({ field, provenance }) {
  const origin = field === 'event_type' ? eventTypeOrigin(provenance) : registrationStatusOrigin(provenance)
  if (!origin) return null
  const kind = origin.kind || 'detected'
  return (
    <span className={`field-origin is-${kind}`}>
      {kind !== 'detected' && <Sparkles size={11} aria-hidden="true" />}
      {origin.label}{kind === 'predicted' ? ' · please confirm' : ''}
    </span>
  )
}
