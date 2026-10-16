export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function sendError(response, error) {
  let status = Number.isInteger(error.status) ? error.status : 500
  if (status >= 500) console.error('Request failed:', error.message)
  const databaseErrors = {
    '22P02': { status: 400, message: 'An event ID or field value has an invalid format.' },
    '23502': { status: 422, message: 'A required event field is missing.' },
    '23505': { status: 409, message: 'An event with that URL slug already exists.' },
    '23514': {
      status: 422,
      message: error.constraint === 'published_event_has_required_fields'
        ? 'A published event must have a name, start date, and IANA timezone.'
        : error.constraint === 'event_end_after_start'
          ? 'The event end timestamp must be on or after its start timestamp.'
          : 'The event does not meet a database requirement. Check its name, date, timezone, and end time.',
    },
    '42501': { status: 503, message: 'The server is not authorized to write this event. Check the backend Supabase configuration.' },
  }
  const databaseError = databaseErrors[error.code]
  if (databaseError) status = databaseError.status
  const message = databaseError?.message
    || (status >= 500
      ? 'The request could not be completed. Verify the backend Supabase configuration and check server logs.'
      : error.message)
  return response.status(status).json({
    error: { message },
  })
}
