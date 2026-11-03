'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Workbook } from 'exceljs'
import { createClient } from '@supabase/supabase-js'

// 初始化 supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractBranchRow = {
  id: bigint
  contract_no: string | null | undefined
  project: string | null
  description: string | null
  branch_name: string | null
  frequency: string | null
  company_name: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  month_of_year: string | null
  times_per_year: string | null
  schedule_rule: string | null
}

type MaintenanceBillRow = {
  id: bigint
  area_code: string | null
  month: string | null
  schedule_month_ref: string | null
  doc_no: string | null
  bill_date: string | null
  company_name: string | null
  branch_name: string | null
  service_type: string | null
  status: string | null
  price: number | null
}

type CheckResult = {
  branchName: string
  month: string
  planService: string | null
  doneService: string | null
  planCount: number
  doneCount: number
  isMatch: boolean
  remark: string
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [runLoading, setRunLoading] = useState(false)
  const [year, setYear] = useState(2026)
  const [checkResults, setCheckResults] = useState<CheckResult[]>([])
  const [filterMode, setFilterMode] = useState<'all' | 'error'>('all')

  // ========== 权限校验 ==========
  useEffect(() => {
    const userRole = 'boss'
    setRole(userRole)
    if (userRole !== 'boss') {
      router.replace('/dashboard')
    }
    setLoading(false)
  }, [router])

  const filteredResult = useMemo(() => {
    if (filterMode === 'error') {
      return checkResults.filter(r => !r.isMatch)
    }
    return checkResults
  }, [checkResults, filterMode])

  const runCheck = async () => {
    setRunLoading(true)
    setCheckResults([])
    try {
      // 1. 获取 contract_branch 计划数据
      const { data: planRaw, error: planErr } = await supabase
        .from('contract_branch')
        .select('branch_name, month_of_year, schedule_rule')
        .eq('year', year)

      if (planErr) throw planErr

      // 2. 获取 maintenance_bills 账单数据
      const { data: billRaw, error: billErr } = await supabase
        .from('maintenance_bills')
        .select('branch_name, month, service_type')
        .eq('year', year)

      if (billErr) throw billErr

      // 分组计划：key = branch_name||month_of_year
      const planMap = new Map<string, { service: string | null; count: number }>()
      planRaw?.forEach((item: { branch_name: string | null; month_of_year: string | null; schedule_rule: string | null }) => {
        const b = item.branch_name?.trim()
        const m = item.month_of_year?.trim()
        if (!b || !m) return
        const key = `${b}||${m}`
        const prev = planMap.get(key)
        if (prev) {
          planMap.set(key, {
            service: prev.service,
            count: prev.count + 1
          })
        } else {
          planMap.set(key, {
            service: item.schedule_rule,
            count: 1
          })
        }
      })

      // 分组账单：key = branch_name||month
      const billMap = new Map<string, { service: string | null; count: number }>()
      billRaw?.forEach((item: { branch_name: string | null; month: string | null; service_type: string | null }) => {
        const b = item.branch_name?.trim()
        const m = item.month?.trim()
        if (!b || !m) return
        const key = `${b}||${m}`
        const prev = billMap.get(key)
        if (prev) {
          billMap.set(key, {
            service: prev.service,
            count: prev.count + 1
          })
        } else {
          billMap.set(key, {
            service: item.service_type,
            count: 1
          })
        }
      })

      // 收集所有唯一分店+月份组合
      const allKeys = new Set([...planMap.keys(), ...billMap.keys()])
      const output: CheckResult[] = []

      for (const key of allKeys) {
        const [branchName, month] = key.split('||')
        const plan = planMap.get(key)
        const bill = billMap.get(key)

        const planService = plan?.service ?? null
        const doneService = bill?.service ?? null
        const planCount = plan?.count ?? 0
        const doneCount = bill?.count ?? 0

        let isMatch = true
        let remark = 'OK'

        if (!plan && bill) {
          isMatch = false
          remark = 'Bill exists, no schedule plan'
        } else if (plan && !bill) {
          isMatch = false
          remark = 'Schedule plan exists, no bill'
        } else if (planCount !== doneCount) {
          isMatch = false
          remark = `Qty mismatch: Plan ${planCount}, Done ${doneCount}`
        } else if (planService !== doneService) {
          isMatch = false
          remark = `Service type mismatch`
        }

        output.push({
          branchName,
          month,
          planService,
          doneService,
          planCount,
          doneCount,
          isMatch,
          remark
        })
      }

      // 按分店名称排序
      output.sort((a, b) => a.branchName.localeCompare(b.branchName))
      setCheckResults(output)
    } catch (err) {
      console.error('Validation Error:', err)
      alert('Query failed, check browser console log')
    } finally {
      setRunLoading(false)
    }
  }

  const exportExcel = async () => {
    if (filteredResult.length === 0) return
    const wb = new Workbook()
    const ws = wb.addWorksheet('Validation Result')
    ws.columns = [
      { header: 'Outlet / Branch', key: 'branchName', width: 22 },
      { header: 'Month', key: 'month', width: 8 },
      { header: 'Plan Service', key: 'planService', width: 14 },
      { header: 'Done Service', key: 'doneService', width: 14 },
      { header: 'Plan Qty', key: 'planCount', width: 10 },
      { header: 'Done Qty', key: 'doneCount', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Remark', key: 'remark', width: 26 },
    ]
    filteredResult.forEach(row => {
      ws.addRow({
        ...row,
        status: row.isMatch ? '✅ Match' : '❌ Mismatch'
      })
    })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Validation_Check_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="p-6">Checking permission...</div>
  if (role !== 'boss') return null

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker</h1>
          <p className="text-gray-500 text-sm">Cross check data between Monthly Schedule / Annual Table / Customer Schedule Report</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          ← Back to Dashboard
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="flex items-center gap-2">
          <span>Year:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border px-2 py-1 rounded"
          >
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span>Filter:</span>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'all' | 'error')}
            className="border px-2 py-1 rounded"
          >
            <option value="all">All Record</option>
            <option value="error">Only Mismatch</option>
          </select>
        </div>

        <button
          onClick={runCheck}
          disabled={runLoading}
          className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-60"
        >
          {runLoading ? 'Checking...' : 'Run Validation Check'}
        </button>

        <button
          onClick={exportExcel}
          disabled={filteredResult.length === 0}
          className="border border-red-600 text-red-600 px-4 py-2 rounded hover:bg-red-50 disabled:opacity-40"
        >
          Export Result
        </button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="p-2 text-left">Outlet / Branch</th>
              <th className="p-2 text-center">Month</th>
              <th className="p-2 text-center">Plan Service</th>
              <th className="p-2 text-center">Done Service</th>
              <th className="p-2 text-center">Plan Qty</th>
              <th className="p-2 text-center">Done Qty</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-left">Remark</th>
            </tr>
          </thead>
          <tbody>
            {filteredResult.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  {checkResults.length === 0
                    ? 'Click [Run Validation Check] to start cross checking'
                    : 'No mismatch found ✅'}
                </td>
              </tr>
            ) : (
              filteredResult.map((row, idx) => (
                <tr key={idx} className={row.isMatch ? 'bg-green-50' : 'bg-red-50'}>
                  <td className="p-2">{row.branchName}</td>
                  <td className="p-2 text-center">{row.month}</td>
                  <td className="p-2 text-center">{row.planService ?? '-'}</td>
                  <td className="p-2 text-center">{row.doneService ?? '-'}</td>
                  <td className="p-2 text-center">{row.planCount}</td>
                  <td className="p-2 text-center">{row.doneCount}</td>
                  <td className="p-2 text-center font-semibold">
                    {row.isMatch ? '✅ Match' : '❌ Mismatch'}
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
