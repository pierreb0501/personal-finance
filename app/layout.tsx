import type { Metadata } from 'next'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { ReconnectBanner } from '@/components/ReconnectBanner'
import { db } from '@/lib/db'
import { getBrokenItems } from '@/lib/db/queries'
import { getSession } from '@/lib/dal'

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The session check here is a UX nicety (don't render authenticated chrome
  // or query account data on the public /login page) — proxy.ts and the DAL
  // are what actually enforce access, not this.
  const session = await getSession()

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hankenGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen bg-[var(--canvas)]">
        {session ? <AuthenticatedChrome>{children}</AuthenticatedChrome> : children}
      </body>
    </html>
  )
}

async function AuthenticatedChrome({ children }: { children: React.ReactNode }) {
  const brokenItems = await getBrokenItems(db)
  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <ReconnectBanner items={brokenItems} />
        {children}
      </main>
    </>
  )
}
