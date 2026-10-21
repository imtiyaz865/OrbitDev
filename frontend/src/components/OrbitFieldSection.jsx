import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react'

const OrbitMeshCanvas = lazy(() => import('./OrbitMeshCanvas.jsx'))

class MeshChunkBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('ORBIT interactive field could not be loaded.', error)
  }

  render() {
    if (this.state.failed) {
      return <div className="orbit-field-fallback" role="img" aria-label="A flowing abstract mesh in ORBIT's colors" />
    }
    return this.props.children
  }
}

export function OrbitFieldSection() {
  const sectionRef = useRef(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    if (!('IntersectionObserver' in window)) {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin: '280px 0px' })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} className="orbit-field-section" aria-labelledby="orbit-field-title">
      <div className="orbit-field-heading">
        <p className="section-eyebrow">ORBIT / INTERACTIVE FIELD</p>
        <h2 id="orbit-field-title">Ideas move<br />in every <em>direction.</em></h2>
        <p>Move through the field. There&apos;s always another connection to make.</p>
      </div>
      <div className="orbit-field-stage" aria-label="Interactive three-dimensional mesh">
        {nearViewport
          ? <MeshChunkBoundary><Suspense fallback={<div className="orbit-field-fallback" aria-hidden="true" />}><OrbitMeshCanvas /></Suspense></MeshChunkBoundary>
          : <div className="orbit-field-fallback" aria-hidden="true" />}
      </div>
    </section>
  )
}
