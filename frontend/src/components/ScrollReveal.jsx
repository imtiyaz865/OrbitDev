import { useEffect, useRef } from 'react'

export function ScrollReveal({ children, className = '', delay = 0, staggerSelector, as: Element = 'div', ...elementProps }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const targets = staggerSelector ? [...node.querySelectorAll(staggerSelector)] : [node]
    if (!('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-revealed'))
      return
    }

    let timer
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      targets.forEach((target, index) => {
        target.style.setProperty('--reveal-delay', `${delay + (staggerSelector ? index * 80 : 0)}ms`)
        target.classList.add('is-revealed')
      })
      timer = window.setTimeout(() => {
        targets.forEach((target) => target.style.removeProperty('--reveal-delay'))
      }, delay + (staggerSelector ? targets.length * 80 : 0) + 500)
    }, { threshold: 0.08 })

    observer.observe(node)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      targets.forEach((target) => {
        target.classList.remove('is-revealed')
        target.style.removeProperty('--reveal-delay')
      })
    }
  }, [delay, staggerSelector])

  return <Element {...elementProps} ref={ref} className={`scroll-reveal ${className}`.trim()}>{children}</Element>
}
