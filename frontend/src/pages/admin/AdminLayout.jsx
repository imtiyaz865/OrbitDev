import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, CalendarRange, LayoutDashboard, LogOut, Settings, Ticket, X } from 'lucide-react'
import { getSupabaseClient } from '../../services/supabase.js'

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState(undefined)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let subscription
    try {
      const supabase = getSupabaseClient()
      supabase.auth.getSession().then(({ data }) => setSession(data.session))
      const result = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession))
      subscription = result.data.subscription
    } catch {
      setSession(null)
    }
    return () => subscription?.unsubscribe()
  }, [])

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    const previousTitle = document.title
    const section = location.pathname.includes('/weekly-update')
      ? 'Weekly update'
      : location.pathname.includes('/events')
        ? 'Events'
        : location.pathname.includes('/settings')
          ? 'Settings'
          : 'Overview'
    document.title = `${section} | ORBIT Studio`
    return () => { document.title = previousTitle }
  }, [location.pathname])

  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]')
    const previousContent = robots?.content
    if (robots) robots.setAttribute('content', 'noindex, nofollow')
    else {
      const tag = document.createElement('meta')
      tag.name = 'robots'
      tag.content = 'noindex, nofollow'
      document.head.appendChild(tag)
    }
    return () => {
      const tag = document.querySelector('meta[name="robots"]')
      if (previousContent != null) tag?.setAttribute('content', previousContent)
      else tag?.remove()
    }
  }, [])

  if (session === undefined) return <div className="admin-loading">Opening workspace…</div>
  if (!session) return <NavigateToLogin navigate={navigate} />

  async function signOut() {
    await getSupabaseClient().auth.signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-app">
      {mobileOpen && <button className="admin-mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>}
      <aside id="admin-navigation" className={`admin-sidebar${mobileOpen ? ' admin-sidebar-open' : ''}`}>
        <NavLink to="/" className="admin-brand" aria-label="ORBIT public website">ORBIT<span className="admin-brand-tag">STUDIO</span></NavLink>
        <div className="admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav">
          <NavLink to="/admin" end><LayoutDashboard size={16} />Overview</NavLink>
          <NavLink to="/admin/events"><Ticket size={16} />Events</NavLink>
          <NavLink to="/admin/weekly-update"><CalendarRange size={16} />Weekly update</NavLink>
          <NavLink to="/admin/settings"><Settings size={16} />Settings</NavLink>
        </nav>
        <div className="admin-sidebar-bottom">
          <a className="admin-sidebar-action" href="/" target="_blank" rel="noreferrer"><ArrowUpRight size={15} />Public website</a>
          <details className="admin-account-menu">
            <summary><span className="admin-avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span><span className="admin-account-copy"><strong>Administrator</strong><small>{session.user.email}</small></span><span className="admin-account-caret">···</span></summary>
            <div className="admin-account-popover">
              <button className="admin-sidebar-action" onClick={signOut}><LogOut size={15} />Sign out</button>
            </div>
          </details>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Toggle navigation" aria-controls="admin-navigation" aria-expanded={mobileOpen}><span /><span /></button>
          <span className="admin-breadcrumb"><span>STUDIO</span><i />{location.pathname.includes('/weekly-update') ? 'Weekly update' : location.pathname.includes('/events') ? 'Events' : location.pathname.includes('/settings') ? 'Settings' : 'Overview'}</span>
          <a className="admin-topbar-public" href="/" target="_blank" rel="noreferrer">View public site <ArrowUpRight size={13} /></a>
        </header>
        <div className="admin-content"><Outlet /></div>
      </div>
    </div>
  )
}

function NavigateToLogin({ navigate }) {
  useEffect(() => navigate('/admin/login', { replace: true }), [navigate])
  return <div className="admin-loading">Redirecting to sign in…</div>
}
