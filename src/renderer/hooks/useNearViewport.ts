import { useEffect, useRef, useState } from 'react'

const DEFAULT_ROOT_MARGIN = '900px'

export function useNearViewport<T extends HTMLElement = HTMLElement>(
  rootMargin = DEFAULT_ROOT_MARGIN
) {
  const ref = useRef<T | null>(null)
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (isNear) return

    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsNear(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true)
          observer.disconnect()
        }
      },
      { root: null, rootMargin, threshold: 0 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [isNear, rootMargin])

  return [ref, isNear] as const
}
