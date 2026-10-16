import { createClient } from '@supabase/supabase-js'

let client

export function getSupabaseClient() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable administrator sign-in.')
  client = createClient(url, key)
  return client
}
