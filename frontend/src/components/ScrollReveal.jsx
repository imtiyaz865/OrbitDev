import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function ScrollReveal({ children, className = '', delay = 0, staggerSelector, as: Element = 'div', ...elementProps }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = gsap.context(() => {
      const targets = staggerSelector ? node.querySelectorAll(staggerSelector) : node
      gsap.fromTo(targets,
        { autoAlpha: 0, y: staggerSelector ? 16 : 22 },
        {
          autoAlpha: 1,
          y: 0,
          duration: staggerSelector ? 0.55 : 0.72,
          delay,
          stagger: staggerSelector ? 0.08 : 0,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: node,
            start: 'top 90%',
            toggleActions: 'play none none reverse',
            invalidateOnRefresh: true,
          },
        })
    }, node)
    return () => context.revert()
  }, [delay, staggerSelector])

  return <Element {...elementProps} ref={ref} className={className}>{children}</Element>
}
