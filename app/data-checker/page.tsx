'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractBranchRow = {
  id: bigint
  contract_no: string | null
  branch_name: string | null
  company_name: string | null
  frequency: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  month_of_year: string | null
  times_per_year: string | null
  schedule_rule: string | null
  project: string | null
}

type MaintenanceBillRow = {
  id: bigint
  schedule_month_ref: string | null
  month: string | null
  company_name: string | null
  branch_name: string | null
  doc_no: string | null
  bill_date: string | null
}

type ScheduleItem = {
  branchName: string
  companyName: string
  planService: string | null
  year: number
  month: number
  monthLabel: string
  status: 'On Time' | 'Done (Late)' | 'Partial Done' | 'Not Start'
}

type StatSummary = {
  totalPlan: number
  groupDone: number
  groupPending: number
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DataValidationChecker() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(2026)
  const [items, setItems] = useState<ScheduleItem[]>([])
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
    setItems([])
    setStat({ totalPlan:0, groupDone:0, groupPending:0 })

    const { data: rawBranches, error: errBr } = await supabase
      .from('contract_branch')
      .select('*')
    if (errBr) {
      alert('读取 contract_branch 失败：' + errBr.message)
      return
    }
    const branches: ContractBranchRow[] = rawBranches as ContractBranchRow[]

    const { data: rawBills, error: errBill } = await supabase
      .from('maintenance_bills')
      .select('*')
    if (errBill) {
      alert('读取 maintenance_bills 失败：' + errBill.message)
      return
    }
    const billList: MaintenanceBillRow[] = rawBills as MaintenanceBillRow[]

    const resultList: ScheduleItem[] = []

    branches.forEach((br: ContractBranchRow) => {
      if (!br.branch_name || !br.start_date || !br.end_date) return
      const start = new Date(br.start_date)
      const end = new Date(br.end_date)

      let cursor = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cursor <= end) {
        const y = cursor.getFullYear()
        const m = cursor.getMonth() + 1

        if (y === year) {
          const refKey = `${br.branch_name}-${y}-${String(m).padStart(2,'0')}`
          const matchedBill = billList.find(b => b.schedule_month_ref === refKey)

          let status: ScheduleItem['status']
          if (matchedBill) {
            const billDate = new Date(matchedBill.bill_date!)
            const dueDate = new Date(y, m, 15)
            status = billDate <= dueDate ? 'On Time' : 'Done (Late)'
          } else {
            status = 'Not Start'
          }

          resultList.push({
            branchName: br.branch_name,
            companyName: br.company_name ?? '-',
            planService: br.frequency,
            year: y,
            month: m,
            monthLabel: `${MONTH_SHORT[m-1]} ${y}`,
            status
          })
        }
        cursor.setMonth(cursor.getMonth() + 1)
      }
    })

    const totalPlan = resultList.length
    const groupDone = resultList.filter(i => i.status === 'On Time' || i.status === 'Done (Late)').length
    const groupPending = resultList.filter(i => i.status === 'Not Start' || i.status === 'Partial Done').length

    setItems(resultList)
    setStat({ totalPlan, groupDone, groupPending })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker</h1>
          <p className="text-gray-500 text-sm">
            Monthly Schedule Counter (Same calculation logic as Dashboard)
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

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="border rounded p-4 bg-slate-50">
            <div className="text-sm text-gray-500">Total Plan (Schedule)</div>
            <div className="text-2xl font-bold mt-1">{stat.totalPlan}</div>
          </div>
          <div className="border rounded p-4 bg-green-50">
            <div className="text-sm text-gray-600">✅ On Time + Done (Late)</div>
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
              <th className="p-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Click [Run Validation Check] to load monthly schedule data
                </td>
              </tr>
            ) : (
              items.map((row, idx) => (
                <tr
                  key={idx}
                  className={
                    row.status === 'On Time' || row.status === 'Done (Late)'
                      ? 'bg-green-50'
                      : 'bg-amber-50'
                  }
                >
                  <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                  <td className="p-2">{row.branchName}</td>
                  <td className="p-2">{row.companyName}</td>
                  <td className="p-2 text-center">{row.monthLabel}</td>
                  <td className="p-2 text-center">{row.planService ?? '-'}</td>
                  <td className="p-2 text-center font-semibold">{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
