import { getSupabase } from '../services/supabase.js'

export async function requireOwner(request, response, next) {
  const authorization = request.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return response.status(401).json({ error: { message: 'Sign in to continue.' } })

  try {
    const supabase = getSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return response.status(401).json({ error: { message: 'Your session is invalid or expired.' } })

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw error
    if (profile?.role !== 'owner') {
      return response.status(403).json({ error: { message: 'This account does not have the owner role. Configure its public.profiles role as owner.' } })
    }
    const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase()
    if (!ownerEmail) {
      return response.status(503).json({ error: { message: 'The backend OWNER_EMAIL is not configured.' } })
    }
    if (user.email?.trim().toLowerCase() !== ownerEmail) {
      return response.status(403).json({ error: { message: 'Sign in with the account configured as the owner.' } })
    }

    request.owner = user
    return next()
  } catch (error) {
    console.error('Owner authorization failed:', error.message)
    return response.status(503).json({ error: { message: 'Owner access could not be verified. Check the Supabase connection and owner profile.' } })
  }
}
