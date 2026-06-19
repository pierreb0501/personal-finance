import type { Metadata } from 'next'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { ReconnectBanner } from '@/components/ReconnectBanner'
import { db } from '@/lib/db'
import { getBrokenItems } from '@/lib/db/queries'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
})

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Personal Finance',
  description: 'Personal finance dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brokenItems = getBrokenItems(db)

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hankenGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen bg-[var(--canvas)]">
        <Sidebar />
        <main className="flex-1 overflow-auto min-w-0">
          <ReconnectBanner items={brokenItems} />
          {children}
        </main>
      </body>
    </html>
  )
}
