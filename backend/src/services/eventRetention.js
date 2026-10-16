export async function purgeExpiredEvents(supabase, now = new Date()) {
  const { data, error } = await supabase.rpc('purge_expired_events', { p_now: now.toISOString() })
  if (error) throw error
  const deleted = Number(data) || 0
  console.info('Expired event retention cleanup completed.', { deleted, checkedAt: now.toISOString() })
  return deleted
}
