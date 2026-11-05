import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSeo } from '../seo/useSeo.js'

export function NotFoundPage() {
  useSeo({ title: 'Page not found · The Orbit', robots: 'noindex, follow' })
  return (
    <section className="tone-dark o-page-hero o-detail-state" aria-labelledby="not-found-title">
      <div className="o-wrap">
        <p className="o-label">Error 404</p>
        <h1 id="not-found-title" className="o-h1">This page is out of orbit.</h1>
        <p className="o-lead">The link may be outdated, or the page may have moved. This weekend’s events are still one click away.</p>
        <div className="o-actions">
          <Link to="/events" className="o-button o-button-light">Browse events <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
          <Link to="/" className="o-link"><ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" /> Back to home</Link>
        </div>
      </div>
    </section>
  )
}
