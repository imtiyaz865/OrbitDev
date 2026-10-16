import { useEffect, useRef, useState } from 'react'
import { format12HourTime, parseTimeInput } from '../utils/times.js'

export function TimeField({ value, onChange, onValidationChange, resetKey, ...inputProps }) {
  const formatted = format12HourTime(value)
  const [draft, setDraft] = useState(formatted)
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) {
      setDraft(formatted)
      setInvalid(false)
      onValidationChange?.(false)
    }
  }, [formatted, resetKey])

  function update(event) {
    const nextValue = event.target.value
    setDraft(nextValue)
    const parsed = parseTimeInput(nextValue)
    const nextInvalid = Boolean(nextValue.trim() && !parsed)
    setInvalid(nextInvalid)
    onValidationChange?.(nextInvalid)
    onChange(parsed)
  }

  function normalize() {
    focused.current = false
    const parsed = parseTimeInput(draft)
    if (parsed) setDraft(format12HourTime(parsed))
    else if (!draft.trim()) setDraft('')
    onChange(parsed)
  }

  return (
    <span className="time-input-wrap">
      <input
        {...inputProps}
        type="text"
        inputMode="text"
        placeholder="09:30 AM"
        value={draft}
        aria-invalid={invalid || undefined}
        onFocus={() => { focused.current = true }}
        onChange={update}
        onBlur={normalize}
      />
      {invalid && <small className="time-input-error" role="alert">Use a time such as 09:30 AM.</small>}
    </span>
  )
}
