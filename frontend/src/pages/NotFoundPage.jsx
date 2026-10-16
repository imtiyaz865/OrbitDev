import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { SiteHeader } from '../components/SiteHeader.jsx'

export function NotFoundPage() {
  return (
    <main className="page-shell">
      <SiteHeader />
      <div className="detail-state"><span className="section-eyebrow">404 · OFF COURSE</span><h1>Not quite<br /><em>in orbit.</em></h1><Link to="/" className="text-link"><ArrowLeft size={15} /> Return home</Link></div>
    </main>
  )
}
