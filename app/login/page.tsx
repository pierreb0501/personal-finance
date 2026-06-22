import { redirect } from 'next/navigation'
import { getSession } from '@/lib/dal'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  const session = await getSession()
  if (session) {
    redirect('/')
  }

  return (
    <main className="min-h-dvh bg-[var(--canvas)] flex items-center justify-center px-4">
      <LoginForm />
    </main>
  )
}
