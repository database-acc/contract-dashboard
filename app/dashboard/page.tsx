import { Suspense } from 'react'
import { connection } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import DashboardStateWrapper from './DashboardStateWrapper'

// 动态导入 Client 组件 Loading
const FullScreenLoading = dynamic(() => import('@/app/components/FullScreenLoading'))

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

// ✅ 新增：更新 Last Data Refresh，仅 account 角色可修改
async function updateLastDataSync(newValue: string, userRole: string, userId: string, userName: string) {
  'use server'
  if (userRole !== 'account') {
    throw new Error('Only Account role can update this time')
  }
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
    .from('system_meta')
    .upsert(
      {
        key: 'last_data_sync',
        value: newValue,
        updated_by: userId,
        updated_name: userName,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    )
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
  const userId = user.id
  const userName = user.user_metadata?.name ?? user.email ?? 'Unknown User'

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profileErr || !profile) {
    redirect('/login')
  }

  // 读取真实角色，限定为三枚举，异常兜底为 staff
  const currentEditorRole = (profile.role ?? 'staff') as 'owner' | 'account' | 'staff'
  const canEditSyncTime = currentEditorRole === 'account'

  // ========== 读取 Last Data Sync（从 value 字段拿手动输入的文本） ==========
  const { data: syncMeta } = await supabase
    .from('system_meta')
    .select('value')
    .eq('key', 'last_data_sync')
    .single()

  const displayTime = syncMeta?.value ?? '-'
  // ===========================================

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
        updateBillServiceType={updateBillServiceType}
        currentEditorName={userName}
        currentEditorRole={currentEditorRole}
        currentUserId={userId}
        updateLastDataSync={updateLastDataSync}
        canEditSyncTime={canEditSyncTime}
        syncTimeValue={displayTime}
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
    <main className="p-3 md:p-4 lg:p-5 max-w-full">
      <Suspense fallback={<FullScreenLoading text="Loading dashboard..." />}>
        <DashboardContent />
      </Suspense>
    </main>
  )
}
