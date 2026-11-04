'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type MonthlyScheduleRow = {
  id: bigint
  branch_name: string | null
  company_name: string | null
  plan_service: string | null
  done_service: string | null
  month: number | null
  year: number | null
  status: string | null
}

type CheckResult = {
  branchName: string
  companyName: string
  month: string
  planService: string | null
  doneService: string | null
  statusTag: string | null
  remark: string
}

type StatSummary = {
  totalPlan: number
  groupDone: number // Done + Done (Late)
  groupPending: number // Not Start + Partial Done
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DataValidationChecker() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(2026)
  const [checkResults, setCheckResults] = useState<CheckResult[]>([])
  const [stat, setStat] = useState<StatSummary>({ totalPlan:0, groupDone:0, groupPending:0 })

  useEffect(() => {
    const userRole = 'boss'
    setRole(userRole)
    if (userRole !== 'boss') {
      router.replace('/dashboard')
    }
    setLoading(false)
  }, [router])

  if (loading) return <div className="p-6">Checking permission...</div>
  if (role !== 'boss') return null

  const runCheck = async () => {
    setCheckResults([])
    setStat({ totalPlan:0, groupDone:0, groupPending:0 })

    // 直接读取 monthly_schedule，和 Dashboard 同一个表！
    const { data: scheduleRaw, error: err } = await supabase
      .from('monthly_schedule')
      .select('*')
      .eq('year', year)

    if (err) {
      alert('读取 monthly_schedule 失败: ' + err.message)
      return
    }

    const scheduleList = scheduleRaw as MonthlyScheduleRow[]
    const output: CheckResult[] = []
    let totalPlan = 0
    let groupDone = 0
    let groupPending = 0

    scheduleList.forEach(row => {
      if (!row.branch_name) return
      totalPlan +=1
      const st = row.status ?? 'Not Start'

      // 分组规则 和 Dashboard 保持一致
      if(st === 'Done' || st === 'Done (Late)'){
        groupDone +=1
      }else{
        groupPending +=1
      }

      output.push({
        branchName: row.branch_name,
        companyName: row.company_name ?? '-',
        month: row.month ? `${MONTH_SHORT[row.month -1]} ${year}` : '-',
        planService: row.plan_service,
        doneService: row.done_service,
        statusTag: st,
        remark: st
      })
    })

    output.sort((a,b) => a.branchName.localeCompare(b.branchName))

    setCheckResults(output)
    setStat({ totalPlan, groupDone, groupPending })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker</h1>
          <p className="text-gray-500 text-sm">
            Monthly Schedule Status Counter (Same source as Dashboard)
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          ← Back
        </button>
      </div>

      <div className="flex gap-3 items-center mb-6">
        <div>
          <span className="mr-2">Year:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border px-2 py-1 rounded"
          >
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
        <button
          onClick={runCheck}
          className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700"
        >
          Run Validation Check
        </button>
      </div>

      {/* 统计卡片 */}
      {checkResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="border rounded p-4 bg-slate-50">
            <div className="text-sm text-gray-500">Total Plan (Schedule)</div>
            <div className="text-2xl font-bold mt-1">{stat.totalPlan}</div>
          </div>
          <div className="border rounded p-4 bg-green-50">
            <div className="text-sm text-gray-600">✅ Done + Done (Late)</div>
            <div className="text-2xl font-bold mt-1 text-green-700">{stat.groupDone}</div>
          </div>
          <div className="border rounded p-4 bg-amber-50">
            <div className="text-sm text-gray-600">⏳ Not Start + Partial Done</div>
            <div className="text-2xl font-bold mt-1 text-amber-700">{stat.groupPending}</div>
          </div>
        </div>
      )}

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="p-2 text-center w-12">No.</th>
              <th className="p-2 text-left">Outlet / Branch</th>
              <th className="p-2 text-left">Company</th>
              <th className="p-2 text-center">Month</th>
              <th className="p-2 text-center">Plan Service</th>
              <th className="p-2 text-center">Done Service</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-left">Remark</th>
            </tr>
          </thead>
          <tbody>
            {checkResults.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  Click [Run Validation Check] to load monthly schedule data
                </td>
              </tr>
            ) : (
              checkResults.map((row, idx) => (
                <tr
                  key={idx}
                  className={
                    row.statusTag === 'Done' || row.statusTag === 'Done (Late)'
                      ? 'bg-green-50'
                      : 'bg-amber-50'
                  }
                >
                  <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                  <td className="p-2">{row.branchName}</td>
                  <td className="p-2">{row.companyName}</td>
                  <td className="p-2 text-center">{row.month}</td>
                  <td className="p-2 text-center">{row.planService ?? '-'}</td>
                  <td className="p-2 text-center">{row.doneService ?? '-'}</td>
                  <td className="p-2 text-center font-semibold">
                    {row.statusTag ?? '-'}
                  </td>
                  <td className="p-2">{row.remark}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
