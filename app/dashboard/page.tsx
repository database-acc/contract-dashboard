import { Suspense } from 'react'
import { connection } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import DashboardStateWrapper from './DashboardStateWrapper'

// contract_branch 表类型
type ContractBranchRow = {
  id: bigint
  contract_no: string | null
  branch_name: string | null
  frequency: string | null
  company_name: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  month_of_year: string | null
  times_per_year: string | null
  schedule_rule: string | null
  project: string | null
}

// maintenance_bills 账单表类型 ✅ 加上 schedule_month_ref + service_type
type MaintenanceBillRow = {
  id: bigint
  area_code: string | null
  month: string | null
  schedule_month_ref: string | null
  doc_no: string | null
  bill_date: string | null
  company_name: string | null
  description: string | null
  agent: string | null
  area: string | null
  project: string | null
  total: number | null
  branch_name: string | null
  service_type: string | null
}

// Server Action 更新 bill service_type
async function updateBillServiceType(billId: bigint, serviceType: string | null) {
  'use server'
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll: () => {},
      },
    }
  )
  await supabase
    .from('maintenance_bills')
    .update({ service_type: serviceType })
    .eq('id', billId)
}

// Server Action 登出
async function signOut() {
  'use server'
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  await supabase.auth.signOut()
  redirect('/login')
}

async function DashboardContent() {
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
        setAll: () => {},
      },
    }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profileErr || !profile) {
    redirect('/login')
  }
  const isBoss = profile.role === 'boss'

  let contractBranchList: ContractBranchRow[] = []
  const { data, error } = await supabase
    .from('contract_branch')
    .select(`
      id,
      contract_no,
      project,
      branch_name,
      frequency,
      company_name,
      description,
      start_date,
      end_date,
      status,
      month_of_year,
      times_per_year,
      schedule_rule
    `)
    .order('branch_name', { ascending: true })

  if (!error) {
    contractBranchList = data ?? []
  }

  let billsList: MaintenanceBillRow[] = []
  const { data: billsData, error: billsErr } = await supabase
    .from('maintenance_bills')
    .select(`
      id,
      area_code,
      month,
      schedule_month_ref,
      doc_no,
      bill_date,
      company_name,
      description,
      agent,
      area,
      project,
      total,
      branch_name,
      service_type
    `)
    .order('id', { ascending: false })

  if (!billsErr) {
    billsList = billsData ?? []
  }

  return (
    <>
      <DashboardStateWrapper
        rawBranchData={contractBranchList}
        rawBillsData={billsList}
        isBoss={isBoss}
        updateBillServiceType={updateBillServiceType}
      >
        <form action={signOut}>
          <button
            type="submit"
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors shadow-sm"
          >
            Sign Out
          </button>
        </form>
      </DashboardStateWrapper>
    </>
  )
}

export default function Dashboard() {
  return (
    <main className="p-4 md:p-6 lg:p-8 max-w-full">
      <Suspense fallback={<p className="text-center">Loading...</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  )
}
