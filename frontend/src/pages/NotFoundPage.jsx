import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { SiteHeader } from '../components/SiteHeader.jsx'

export function NotFoundPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Page not found | ORBIT'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <main className="page-shell">
      <SiteHeader />
      <div className="detail-state"><span className="section-eyebrow">404 · PAGE NOT FOUND</span><h1>This page is<br /><em>out of view.</em></h1><Link to="/" className="text-link"><ArrowLeft size={15} /> Return to events</Link></div>
    </main>
  )
}
