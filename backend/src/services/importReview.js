import { predictEventType } from './eventType.js'
import { resolveRegistrationStatus } from './registrationStatus.js'

const REQUIRED_FOR_VERIFICATION = ['name', 'start_date', 'start_time', 'timezone']
const SCHEDULE_FIELDS = new Set(['start_date', 'start_time', 'end_date', 'end_time', 'timezone', 'general'])

function words(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*/gu) || [])
    .map((word) => word.replace(/[.'’-]+$/u, ''))
    .filter(Boolean)
}

function tokens(text, pattern) {
  return new Set(String(text || '').match(pattern) || [])
}

/**
 * True when `formatted` is only a re-layout of `original`: no new numbers, URLs,
 * e-mail addresses or words, nothing meaningful dropped, similar length.
 */
export function preservesFacts(original, formatted) {
  if (typeof original !== 'string' || typeof formatted !== 'string') return false
  const base = original.trim()
  const next = formatted.trim()
  if (!base || !next || base === next) return false
  if (next.length > base.length * 1.25 + 80 || next.length < base.length * 0.85) return false
  const urlPattern = /https?:\/\/[^\s)>\]]+|[\w.+-]+@[\w-]+\.[\w.]+/gi
  for (const url of tokens(next, urlPattern)) if (!base.includes(url)) return false
  const numberPattern = /\d+(?:[.,:/]\d+)*/g
  const baseNumbers = tokens(base, numberPattern)
  const nextNumbers = tokens(next, numberPattern)
  for (const number of nextNumbers) if (!baseNumbers.has(number)) return false
  for (const number of baseNumbers) if (!nextNumbers.has(number)) return false
  // Re-layout adds no words; at most a connective may disappear into a bullet.
  const baseWords = new Set(words(base))
  const nextWords = words(next)
  if (nextWords.some((word) => !baseWords.has(word))) return false
  const nextSet = new Set(nextWords)
  const removed = [...baseWords].filter((word) => !nextSet.has(word))
  return removed.length <= Math.max(1, Math.floor(baseWords.size * 0.01))
}

/** Detects image URLs that stop working: LinkedIn `e=` expiries and signed S3/CloudFront links. */
export function imageUrlExpiry(value, now = new Date()) {
  let url
  try { url = new URL(value) } catch { return null }
  const params = url.searchParams
  if (/(^|\.)licdn\.com$/i.test(url.hostname) && /^\d{9,11}$/.test(params.get('e') || '')) {
    return { expiresAt: new Date(Number(params.get('e')) * 1000).toISOString(), expired: Number(params.get('e')) * 1000 <= now.getTime() }
  }
  const signed = ['X-Amz-Signature', 'X-Amz-Expires', 'Signature', 'Expires', 'Key-Pair-Id'].some((key) => params.has(key))
  if (signed) {
    const epoch = Number(params.get('Expires'))
    const expiresAt = Number.isFinite(epoch) && epoch > 1e9 ? new Date(epoch * 1000).toISOString() : null
    return { expiresAt, expired: expiresAt ? Date.parse(expiresAt) <= now.getTime() : false }
  }
  return null
}

function indiaToday(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
}

/**
 * Final pass over an import result, with or without Gemini analysis:
 * decides the event type (confirmed or predicted, with a confidence) and the
 * registration status (from page evidence, else "not_announced"), applies a fact-preserving formatted description,
 * turns review flags and schedule problems into warnings, and decides whether
 * the import can start as `verified`. Never invents values.
 */
export function finalizeImport(result, analysis = null, { now = new Date() } = {}) {
  const fields = { ...result.fields }
  const provenance = { ...result.field_provenance }
  const warnings = [...(result.warnings || [])]
  const missing = new Set(result.missing_fields || [])
  const research = { ...(result.research || {}) }
  let scheduleConcern = false

  const signals = result.signals || {}
  // A type already on the record came from the page's own metadata (or an upstream step); it wins.
  const sourceType = fields.event_type && (!provenance.event_type || provenance.event_type.method === 'source_metadata') ? fields.event_type : null
  const prediction = predictEventType(fields, {
    sourceType,
    aiType: signals.ai_event_type,
    pageText: signals.page_text,
  })
  if (prediction) {
    fields.event_type = prediction.type
    provenance.event_type = {
      method: prediction.method,
      confirmed: prediction.confirmed,
      confidence: prediction.confidence,
      signals: prediction.signals,
      ...(prediction.signals.includes('ai') && research.model ? { model: research.model } : {}),
      ...(provenance.event_type?.source_url ? { source_url: provenance.event_type.source_url } : {}),
    }
  } else {
    fields.event_type = fields.event_type || null
  }

  const registration = resolveRegistrationStatus({
    page: signals.registration_page,
    metadata: signals.registration_metadata,
    ai: signals.ai_registration_status,
    deadline: fields.registration_deadline,
    now,
  })
  fields.registration_status = registration.status
  provenance.registration_status = { method: registration.method, ...(registration.evidence ? { evidence: String(registration.evidence).slice(0, 200) } : {}) }
  if (registration.status === 'not_announced') {
    warnings.push({ field: 'registration_status', message: 'The source page does not show whether registration is open. It is set to "Not announced"; update it if you know the status.' })
  }

  const formatted = analysis?.formatted_description
  if (formatted && preservesFacts(fields.description, formatted)) {
    research.original_description = fields.description
    fields.description = formatted
    provenance.description = { ...(typeof provenance.description === 'object' ? provenance.description : {}), method: 'gemini_format', model: research.model || null }
  }

  for (const flag of analysis?.review_flags || []) {
    warnings.push({ field: flag.field === 'general' ? 'review' : flag.field, message: `AI review: ${flag.message}` })
    if (flag.kind === 'date_time' && SCHEDULE_FIELDS.has(flag.field)) {
      scheduleConcern = true
      if (['start_date', 'start_time', 'timezone'].includes(flag.field)) missing.add(flag.field)
    }
  }

  if (fields.start_date && fields.start_date < indiaToday(now)) {
    scheduleConcern = true
    warnings.push({ field: 'start_date', message: 'The event date is in the past. Check that the source page shows the current edition of this event.' })
  }
  if (fields.start_at && fields.end_at && Date.parse(fields.end_at) < Date.parse(fields.start_at)) {
    scheduleConcern = true
    warnings.push({ field: 'end_time', message: 'The end time is before the start time.' })
  }

  const expiry = fields.banner_url ? imageUrlExpiry(fields.banner_url, now) : null
  if (expiry) {
    warnings.push({
      field: 'banner_url',
      message: expiry.expired
        ? 'This banner link has already expired and will not load. Replace it with a permanent image URL.'
        : `This banner link is temporary${expiry.expiresAt ? ` and expires on ${expiry.expiresAt.slice(0, 10)}` : ''}. Replace it with a permanent image URL so it keeps loading.`,
    })
  }

  const extracted = research.status !== 'failed'
  const verified = extracted
    && Boolean(fields.name?.trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(fields.start_date || '')
    && /^\d{2}:\d{2}/.test(fields.start_time || '')
    && Boolean(fields.timezone)
    && Boolean(fields.start_at)
    && !REQUIRED_FOR_VERIFICATION.some((field) => missing.has(field))
    && !scheduleConcern
  fields.verification_status = verified ? 'verified' : 'needs_review'
  fields.last_verified_at = verified ? (result.extracted_at || now.toISOString()) : null

  const { signals: _signals, ...rest } = result
  return { ...rest, fields, field_provenance: provenance, warnings, missing_fields: [...missing], research }
}
