import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import ManutencaoClient from './client'

export default async function ManutencaoPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/auth/login')
  }

  const userRole = (session.user as any)?.role
  if (userRole !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  return <ManutencaoClient />
}
