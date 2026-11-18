'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('stripe-press-theme', next ? 'dark' : 'light')
    } catch {
      // storage unavailable; ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label="Toggle library at night mode"
      className="text-muted transition-colors duration-500 hover:text-ink"
    >
      [ {dark ? 'Day' : 'Night'} ]
    </button>
  )
}