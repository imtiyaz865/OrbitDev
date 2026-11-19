import assert from 'node:assert/strict'
import test from 'node:test'
import { compareEvents, normalizeSourceUrl, sourceSearchFragment, titleSimilarity } from './duplicateDetection.js'

test('source URLs are normalised per platform so variants of one page match', () => {
  assert.equal(normalizeSourceUrl('https://lu.ma/ai-night?utm_source=x&tk=abc'), 'luma:ai-night')
  assert.equal(normalizeSourceUrl('https://luma.com/AI-Night/'), 'luma:ai-night')
  assert.equal(normalizeSourceUrl('https://www.meetup.com/react-hyd/events/301234567/?eventOrigin=group'), 'meetup:301234567')
  assert.equal(normalizeSourceUrl('https://meetup.com/react-hyd/events/301234567'), 'meetup:301234567')
  assert.equal(normalizeSourceUrl('https://www.eventbrite.com/e/devops-day-tickets-987654321?aff=ebdssbdestsearch'), 'eventbrite:987654321')
  assert.equal(normalizeSourceUrl('https://www.eventbrite.co.uk/e/devops-day-tickets-987654321'), 'eventbrite:987654321')
  assert.equal(normalizeSourceUrl('https://www.example.com/events/ai-night/?utm_campaign=a&id=4&fbclid=z'), 'web:example.com/events/ai-night?id=4')
  assert.notEqual(normalizeSourceUrl('https://example.com/events/a?id=4'), normalizeSourceUrl('https://example.com/events/a?id=5'))
  assert.equal(normalizeSourceUrl('not a url'), null)
  assert.equal(normalizeSourceUrl('ftp://example.com/x'), null)
  assert.equal(sourceSearchFragment('meetup:301234567'), '301234567')
  assert.equal(sourceSearchFragment('web:example.com/events/ai_night?id=4'), 'ainight')
})

const existing = {
  id: 'existing', name: 'React Hyderabad Meetup #8', status: 'published', start_date: '2026-12-05', start_time: '10:00',
  organizer_name: 'React Hyderabad', source_url: 'https://lu.ma/react-hyd-8',
}

test('the same source page is always a duplicate, whatever the details say', () => {
  const result = compareEvents({ name: 'Something else', source_url: 'https://luma.com/react-hyd-8?utm_source=share' }, existing)
  assert.equal(result.match, 'source_url')
  assert.equal(result.confidence, 'certain')
})

test('the same event under another URL is matched by title, date and organizer', () => {
  const result = compareEvents({ name: 'React Hyderabad Meetup #8', start_date: '2026-12-05', start_time: '10:00', organizer_name: 'React Hyderabad', source_url: 'https://www.meetup.com/react-hyd/events/1234567/' }, existing)
  assert.equal(result.match, 'similar_details')
  assert.equal(result.confidence, 'high')
  assert.ok(result.reasons.includes('Same organizer'))
  // Small title differences on the same day still match.
  assert.ok(compareEvents({ name: 'React Hyderabad Meetup #8 – Hooks deep dive', start_date: '2026-12-05', organizer_name: 'React Hyderabad Community' }, existing))
})

test('different events with similar titles are not flagged', () => {
  const cases = [
    ['next edition (different number)', { name: 'React Hyderabad Meetup #9', start_date: '2026-12-05' }],
    ['different technology, same day', { name: 'Angular Hyderabad Meetup #8', start_date: '2026-12-05' }],
    ['different organizer', { name: 'React Hyderabad Meetup #8', start_date: '2026-12-05', organizer_name: 'GDG Hyderabad' }],
    ['same title, next week', { name: 'React Hyderabad Meetup #8', start_date: '2026-12-12' }],
    ['morning and evening sessions', { name: 'React Hyderabad Meetup #8', start_date: '2026-12-05', start_time: '18:00' }],
    ['adjacent day without the organizer', { name: 'React Hyderabad Meetup #8', start_date: '2026-12-06' }],
    ['no date to compare', { name: 'React Hyderabad Meetup #8' }],
  ]
  for (const [label, candidate] of cases) assert.equal(compareEvents(candidate, existing), null, label)
})

test('an adjacent date (timezone slip) matches only with the same organizer and title', () => {
  const result = compareEvents({ name: 'React Hyderabad Meetup #8', start_date: '2026-12-04', organizer_name: 'React Hyderabad' }, existing)
  assert.equal(result.match, 'similar_details')
  assert.ok(result.reasons.includes('Adjacent date'))
})

test('title similarity ignores case, punctuation and filler words', () => {
  assert.equal(titleSimilarity('The AI Summit, Hyderabad', 'ai summit'), 1)
  assert.ok(titleSimilarity('Kubernetes Workshop', 'Terraform Workshop') < 0.7)
  assert.equal(titleSimilarity('', 'x'), 0)
})
