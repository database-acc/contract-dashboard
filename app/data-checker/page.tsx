'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Workbook } from 'exceljs'

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
    // TODO: 替换成你真实的用户role读取逻辑（supabase session / global state）
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
    // TODO: 这里放 supabase query，拉 contract_branch + maintenance_bills，做对比
    // 示例：
    // const { data: planData } = await supabase.from('contract_branch').select('*').eq('year', year)
    // const { data: billData } = await supabase.from('maintenance_bills').select('*').eq('year', year)
    // 然后循环分组比对，组装 CheckResult[]

    setTimeout(() => {
      setCheckResults([
        {
          branchName: 'CBTL KLCC',
          month: 'Jan',
          planService: 'GWM',
          doneService: 'GWM',
          planCount: 2,
          doneCount: 2,
          isMatch: true,
          remark: 'OK'
        },
        {
          branchName: 'Nandos Midvalley',
          month: 'Jan',
          planService: 'KPM',
          doneService: 'GWM',
          planCount: 1,
          doneCount: 1,
          isMatch: false,
          remark: 'Service Type not match'
        }
      ])
      setRunLoading(false)
    }, 800)
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
