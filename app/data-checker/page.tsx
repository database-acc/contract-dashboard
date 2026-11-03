'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Workbook } from 'exceljs'
import { createClient } from '@supabase/supabase-js'

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
  customer: string
  monthNum: number
  planServices: string[]
  doneServices: string[]
  planCount: number
  doneCount: number
  isMatch: boolean
  remark: string
}

const jobPriority: Record<string, number> = { GWM: 1, KPM: 2, KPS: 3, GTC: 4 }

function splitServiceTypes(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split('&').map((s: string) => s.trim()).filter(Boolean)
}

function getContractJobType(contractNo: string | null | undefined): string | null {
  if (!contractNo) return null
  const parts = contractNo.split('-')
  const type = parts.length > 1 ? parts[1].trim() : ''
  if (['GWM', 'KPS', 'KPM', 'GTC'].includes(type)) return type
  return null
}

const monthAbbrMap: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
}

type ParsedMonthItem = {
  year: number;
  month: number;
}
type ParseResult = {
  list: ParsedMonthItem[];
  isMultiMonth: boolean;
  originalText: string;
}

function parseBillMonth(monthStr: string | null): ParseResult {
  if (!monthStr) return { list: [], isMultiMonth: false, originalText: '' }
  const results: ParsedMonthItem[] = []
  const parts = monthStr.split('&').map((s: string) => s.trim()).filter(Boolean)
  const isMultiMonth = parts.length > 1
  for (const s of parts) {
    const dateSlashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (dateSlashMatch) {
      const m = parseInt(dateSlashMatch[2],10)
      const y = parseInt(dateSlashMatch[3],10)
      if (m >=1 && m <=12 && y >=2020) {
        results.push({year:y, month:m})
        continue
      }
    }
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10)
      const m = parseInt(isoMatch[2], 10)
      if (m >= 1 && m <= 12 && y >= 2020) {
        results.push({ year: y, month: m })
        continue
      }
    }
    const mAbbr = s.match(/^([A-Za-z]{3})-(\d{2})$/)
    if (mAbbr) {
      const month = monthAbbrMap[mAbbr[1]]
      if (!month) continue
      const yy = parseInt(mAbbr[2], 10)
      const fullYear = 2000 + yy
      if (fullYear >= 2020) {
        results.push({ year: fullYear, month })
      }
    }
  }
  return { list: results, isMultiMonth, originalText: monthStr.trim() }
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [runLoading, setRunLoading] = useState(false)
  const [year, setYear] = useState(2026)
  const [customerFilter, setCustomerFilter] = useState<'all' | 'CBTL' | "Nando's">('all')
  const [checkResults, setCheckResults] = useState<CheckResult[]>([])
  const [filterMode, setFilterMode] = useState<'all' | 'error'>('all')

  useEffect(() => {
    const userRole = 'boss'
    setRole(userRole)
    if (userRole !== 'boss') {
      router.replace('/dashboard')
    }
    setLoading(false)
  }, [router])

  const filteredResult = useMemo(() => {
    let list = checkResults
    if (customerFilter !== 'all') {
      list = list.filter(r => r.customer === customerFilter)
    }
    if (filterMode === 'error') {
      list = list.filter(r => !r.isMatch)
    }
    return list
  }, [checkResults, filterMode, customerFilter])

  const runCheck = async () => {
    setRunLoading(true)
    setCheckResults([])
    try {
      const { data: planRaw, error: planErr } = await supabase
        .from('contract_branch')
        .select('branch_name, company_name, contract_no, month_of_year, start_date, status')
      if (planErr) throw planErr

      const { data: billRaw, error: billErr } = await supabase
        .from('maintenance_bills')
        .select('branch_name, company_name, month, schedule_month_ref, service_type, bill_date')
      if (billErr) throw billErr

      const planFiltered = planRaw?.filter(item => {
        if (!item.start_date || item.status !== 'active') return false
        const rowYear = new Date(item.start_date).getFullYear()
        return rowYear === year
      }) ?? []

      const billFiltered = billRaw?.filter(item => {
        if (!item.bill_date) return false
        const rowYear = new Date(item.bill_date).getFullYear()
        return rowYear === year
      }) ?? []

      // plan map: key: branch|monthNum
      const planMap = new Map<string, { services: string[], customer: string }>()
      planFiltered.forEach(item => {
        const b = item.branch_name?.trim()
        const cName = item.company_name ?? ''
        if (!b || !item.month_of_year) return
        const service = getContractJobType(item.contract_no)
        if (!service) return
        // ✅ 修复这里的 x 和 n any 类型报错
        const monthParts = item.month_of_year.split(',').map((x: string)=>parseInt(x.trim())).filter((n: number)=>!Number.isNaN(n) && n>=1 && n<=12)
        for(const m of monthParts) {
          const key = `${b}|${m}`
          const entry = planMap.get(key)
          if(entry) {
            if(!entry.services.includes(service)) entry.services.push(service)
          } else {
            planMap.set(key, { services: [service], customer: cName })
          }
        }
      })

      // bill map
      const billMap = new Map<string, string[]>()
      billFiltered.forEach(item => {
        const b = item.branch_name?.trim()
        if (!b) return
        const refStr = item.schedule_month_ref ?? item.month
        const parseRes = parseBillMonth(refStr)
        const serviceList = splitServiceTypes(item.service_type)
        for(const ym of parseRes.list) {
          if(ym.year !== year) continue
          const m = ym.month
          const key = `${b}|${m}`
          const exist = billMap.get(key) ?? []
          serviceList.forEach((s: string)=>{
            if(!exist.includes(s)) exist.push(s)
          })
          billMap.set(key, exist)
        }
      })

      const allKeys = new Set([...planMap.keys(), ...billMap.keys()])
      const output: CheckResult[] = []

      for (const key of allKeys) {
        const [branchName, monthStr] = key.split('|')
        const monthNum = parseInt(monthStr)
        const plan = planMap.get(key)
        const doneServices = billMap.get(key) ?? []
        const planServices = plan?.services ?? []
        const customer = plan?.customer ?? ''

        let isMatch = true
        let remark = 'OK'
        const planSorted = [...planServices].sort((a,b)=>(jobPriority[a]??99)-(jobPriority[b]??99))
        const doneSorted = [...doneServices].sort((a,b)=>(jobPriority[a]??99)-(jobPriority[b]??99))

        if (!plan && doneServices.length>0) {
          isMatch = false
          remark = 'Bill exists, no schedule plan'
        } else if (plan && doneServices.length === 0) {
          isMatch = false
          remark = 'Schedule plan exists, no bill'
        } else if (JSON.stringify(planSorted) !== JSON.stringify(doneSorted)) {
          isMatch = false
          remark = `Service mismatch. Plan: ${planSorted.join(',')}, Done: ${doneSorted.join(',')}`
        }

        output.push({
          branchName,
          customer,
          monthNum,
          planServices: planSorted,
          doneServices: doneSorted,
          planCount: planServices.length,
          doneCount: doneServices.length,
          isMatch,
          remark
        })
      }

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
      { header: 'Customer', key: 'customer', width: 16 },
      { header: 'Month', key: 'monthNum', width: 8 },
      { header: 'Plan Service', key: 'planService', width: 18 },
      { header: 'Done Service', key: 'doneService', width: 18 },
      { header: 'Plan Qty', key: 'planCount', width: 10 },
      { header: 'Done Qty', key: 'doneCount', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Remark', key: 'remark', width: 30 },
    ]
    filteredResult.forEach(row => {
      ws.addRow({
        branchName: row.branchName,
        customer: row.customer,
        monthNum: row.monthNum,
        planService: row.planServices.join(' & '),
        doneService: row.doneServices.join(' & '),
        planCount: row.planCount,
        doneCount: row.doneCount,
        status: row.isMatch ? '✅ Match' : '❌ Mismatch',
        remark: row.remark
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
          <span>Customer:</span>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value as any)}
            className="border px-2 py-1 rounded"
          >
            <option value="all">All</option>
            <option value="CBTL">CBTL</option>
            <option value="Nando's">Nando's</option>
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
              <th className="p-2 text-left">Customer</th>
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
                <td colSpan={9} className="p-4 text-center text-gray-500">
                  {checkResults.length === 0
                    ? 'Click [Run Validation Check] to start cross checking'
                    : 'No mismatch found ✅'}
                </td>
              </tr>
            ) : (
              filteredResult.map((row, idx) => (
                <tr key={idx} className={row.isMatch ? 'bg-green-50' : 'bg-red-50'}>
                  <td className="p-2">{row.branchName}</td>
                  <td className="p-2">{row.customer}</td>
                  <td className="p-2 text-center">{row.monthNum}</td>
                  <td className="p-2 text-center">{row.planServices.join(' & ') || '-'}</td>
                  <td className="p-2 text-center">{row.doneServices.join(' & ') || '-'}</td>
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
