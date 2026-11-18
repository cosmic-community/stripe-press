'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function KeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.key === 'Escape') {
        if (pathname !== '/') {
          router.push('/')
        }
      } else if (event.key === 'b' || event.key === 'B') {
        router.push('/books')
      } else if (event.key === 'm' || event.key === 'M') {
        router.push('/#websites')
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, pathname])

  return null
}