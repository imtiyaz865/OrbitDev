export async function runSingleSubmission(lock, task) {
  if (lock.current) return false
  lock.current = true
  try {
    await task()
    return true
  } finally {
    lock.current = false
  }
}
