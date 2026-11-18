import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import KeyboardShortcuts from '@/components/KeyboardShortcuts'
import DemoBanner from '@/components/DemoBanner'

export const metadata: Metadata = {
  title: {
    default: 'Stripe Press — Ideas for progress',
    template: '%s — Stripe Press',
  },
  description:
    'A publishing house for ideas for progress. Books, essays and companion websites.',
}

const themeInit = `try{if(localStorage.getItem('stripe-press-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {/* Console capture script for dashboard debugging */}
        <script src="/dashboard-console-capture.js" />
              <script defer src="https://insights.cosmicinsights.dev/script.js" data-project="6afdf26a48f83858e228fb10"></script>
        <script
          src="https://www.cosmicjs.com/agent.js"
          data-key="pk_42dc45fa96a06c4a205b771561a64ad6"
          async
        ></script>
      </head>
      <body className="min-h-screen bg-paper font-serif text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:bg-ink focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-paper"
        >
          Skip to content
        </a>
        <DemoBanner position="top" />
        <Header />
        <main id="main" className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          {children}
        </main>
        <Footer />
        <DemoBanner position="bottom" />
        <KeyboardShortcuts />
      </body>
    </html>
  )
}