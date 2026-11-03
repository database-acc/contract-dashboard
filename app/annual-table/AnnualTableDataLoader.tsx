'use server'
import { connection } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AnnualTableWrapper from './AnnualTableWrapper'

type Props = {
  searchParams: Promise<{ year?: string }>
}

export default async function AnnualTableDataLoader({ searchParams }: Props) {
  await connection()
  const params = await searchParams
  const targetYear = Number(params.year) || 2026
  const yearSuffix = String(targetYear).slice(-2)

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const { data: billData, error: billErr } = await supabase
    .from('maintenance_bills')
    .select('*')
    .like('project', '%CONTRACT%')
    .like('month', `%-${yearSuffix}`)
    .order('month', { ascending: true })

  // 全部contract一次性取出，前端过滤年份
  const { data: contractData, error: contractErr } = await supabase
    .from('contract_branch')
    .select('*')
    .like('project', '%CONTRACT%')
    .order('branch_name', { ascending: true })

  console.log('【Server】targetYear:', targetYear)
  console.log('【Server】contractData count:', contractData?.length, contractErr)
  console.log('【Server】billData count:', billData?.length, billErr)

  return (
    <AnnualTableWrapper
      contractData={contractData ?? []}
      billData={billData ?? []}
      initYear={targetYear}
    />
  )
}
