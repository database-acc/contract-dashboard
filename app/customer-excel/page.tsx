import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { connection } from 'next/server'
import CustomerExcelTable from './CustomerExcelTable'

type ContractBranchRow = {
  id: bigint
  contract_no: string | null
  branch_name: string | null
  company_name: string | null
  frequency: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  month_of_year: string | null
  times_per_year: string | null
  schedule_rule: string | null
  jan_price: number | null
  jan_midnight: number | null
  jan_outstation: number | null
  feb_price: number | null
  feb_midnight: number | null
  feb_outstation: number | null
  mar_price: number | null
  mar_midnight: number | null
  mar_outstation: number | null
  apr_price: number | null
  apr_midnight: number | null
  apr_outstation: number | null
  may_price: number | null
  may_midnight: number | null
  may_outstation: number | null
  jun_price: number | null
  jun_midnight: number | null
  jun_outstation: number | null
  jul_price: number | null
  jul_midnight: number | null
  jul_outstation: number | null
  aug_price: number | null
  aug_midnight: number | null
  aug_outstation: number | null
  sep_price: number | null
  sep_midnight: number | null
  sep_outstation: number | null
  oct_price: number | null
  oct_midnight: number | null
  oct_outstation: number | null
  nov_price: number | null
  nov_midnight: number | null
  nov_outstation: number | null
  dec_price: number | null
  dec_midnight: number | null
  dec_outstation: number | null
  state: string | null
}

async function DataLoader() {
  await connection()
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {}
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <div>Unauthorized, please login</div>
  }

  const { data, error } = await supabase.from('contract_branch').select('*')
  if (error) throw error

  return <CustomerExcelTable rawData={data as ContractBranchRow[]} />
}

export default async function CustomerExcelPage() {
  return (
    <div className="p-6">
      <Suspense fallback={<p>Loading data...</p>}>
        <DataLoader />
      </Suspense>
    </div>
  )
}
