'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractRow = {
  id: bigint
  contract_no: string | null
  branch_name: string | null
  company_name: string | null
  frequency: string | null
  times_per_year: string | null
  schedule_rule: string | null
  month_of_year: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
}

type DashboardPlanRow = {
  id: bigint
  branchName: string
  companyName: string
  serviceType: string
}

const MONTHS = [
  { num:1, label:'Jan'},{ num:2, label:'Feb'},{ num:3, label:'Mar'},
  { num:4, label:'Apr'},{ num:5, label:'May'},{ num:6, label:'Jun'},
  { num:7, label:'Jul'},{ num:8, label:'Aug'},{ num:9, label:'Sep'},
  { num:10, label:'Oct'},{ num:11, label:'Nov'},{ num:12, label:'Dec'},
]

function isWorkInMonth(
  freq: string | null,
  targetYear: number,
  targetMonth: number,
  startDateStr: string | null,
  endDateStr: string | null,
  status: string | null,
  monthOfYear: string | null
): boolean {
  if (status !== 'active') return false
  const targetYM = targetYear * 12 + targetMonth

  let startYM = -Infinity
  if (startDateStr && startDateStr.trim()) {
    const parts = startDateStr.trim().split('-').map(Number)
    const sy = parts[0]
    const sm = parts[1]
    if (!Number.isNaN(sy) && !Number.isNaN(sm)) {
      startYM = sy * 12 + sm
    }
  }
  let endYM = Infinity
  if (endDateStr && endDateStr.trim()) {
    const parts = endDateStr.trim().split('-').map(Number)
    const ey = parts[0]
    const em = parts[1]
    if (!Number.isNaN(ey) && !Number.isNaN(em)) {
      endYM = ey * 12 + em
    }
  }
  if (targetYM < startYM || targetYM > endYM) return false

  if (monthOfYear && monthOfYear.trim()) {
    const months = monthOfYear
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
    return months.includes(targetMonth)
  }
  if (freq === 'monthly') return true
  if (freq === 'quarterly') return [1, 4, 7, 10].includes(targetMonth)
  if (freq === 'half_year') return [1, 7].includes(targetMonth)
  return false
}

function extractService(contractNo: string | null | undefined): string | null {
  if (!contractNo) return null
  const parts = String(contractNo).split('-')
  if (parts.length >= 2) {
    const t = parts[1].trim()
    if (['GWM','KPM','KPS','GTC'].includes(t)) return t
  }
  return null
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [selectedMonth, setSelectedMonth] = useState(1)
  const [contractList, setContractList] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const dashboardPlanRows: DashboardPlanRow[] = useMemo(()=>{
    if(!loaded || contractList.length ===0) return []
    const result:DashboardPlanRow[] = []
    contractList.forEach(ct=>{
      const ok = isWorkInMonth(
        ct.frequency,
        year,
        selectedMonth,
        ct.start_date,
        ct.end_date,
        ct.status,
        ct.month_of_year
      )
      if(!ok) return
      const svc = extractService(ct.contract_no)
      if(!svc) return
      result.push({
        id: ct.id,
        branchName: ct.branch_name ?? '',
        companyName: ct.company_name ?? '-',
        serviceType: svc
      })
    })
    result.sort((a,b)=> a.branchName.localeCompare(b.branchName))
    return result
  },[contractList, loaded, year, selectedMonth])

  const stat = useMemo(()=>{
    const total = dashboardPlanRows.length
    const gwm = dashboardPlanRows.filter(r=>r.serviceType === 'GWM').length
    const kpm = dashboardPlanRows.filter(r=>r.serviceType === 'KPM').length
    const kps = dashboardPlanRows.filter(r=>r.serviceType === 'KPS').length
    const gtc = dashboardPlanRows.filter(r=>r.serviceType === 'GTC').length
    return {total,gwm,kpm,kps,gtc}
  },[dashboardPlanRows])

  const load = async ()=>{
    setLoading(true)
    const {data,error} = await supabase
      .from('contract_branch')
      .select('*')
      .eq('status','active')
    if(error){
      alert('读取contract_branch失败：'+error.message)
      setLoading(false)
      return
    }
    setContractList(data as ContractRow[])
    setLoaded(true)
    setLoading(false)
  }

  const monthLabel = MONTHS.find(m=>m.num === selectedMonth)?.label

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker · Verify Dashboard Plan Count</h1>
          <p className="text-sm text-gray-500">
            【复刻Dashboard Monthly Schedule计算逻辑】同一页面直接输出该年月全部Plan明细，无需切换Dashboard页面核对数量
          </p>
        </div>
        <button onClick={()=>router.back()} className="px-4 py-2 border rounded hover:bg-gray-100">
          ← Back
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-6">
        <div className="flex items-center gap-2">
          <span>Year:</span>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} className="border px-2 py-1 rounded">
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
            <option value={2028}>2028</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span>Month:</span>
          <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} className="border px-2 py-1 rounded">
            {MONTHS.map(m=><option key={m.num} value={m.num}>{m.label}</option>)}
          </select>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load & Calculate Plan Schedule'}
        </button>
      </div>

      {loaded && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="border rounded p-4 bg-slate-50">
              <div className="text-xs text-gray-500">{monthLabel} {year} — Total Plan Rows</div>
              <div className="text-2xl font-bold">{stat.total}</div>
            </div>
            <div className="border rounded p-4 bg-sky-50">
              <div className="text-xs text-sky-600">GWM</div>
              <div className="text-2xl font-bold text-sky-700">{stat.gwm}</div>
            </div>
            <div className="border rounded p-4 bg-violet-50">
              <div className="text-xs text-violet-600">KPM</div>
              <div className="text-2xl font-bold text-violet-700">{stat.kpm}</div>
            </div>
            <div className="border rounded p-4 bg-emerald-50">
              <div className="text-xs text-emerald-600">KPS</div>
              <div className="text-2xl font-bold text-emerald-700">{stat.kps}</div>
            </div>
            <div className="border rounded p-4 bg-amber-50">
              <div className="text-xs text-amber-600">GTC</div>
              <div className="text-2xl font-bold text-amber-700">{stat.gtc}</div>
            </div>
          </div>

          <div className="text-sm text-gray-500 mb-3">
            💡校验方法：打开Dashboard，选择完全相同的【{monthLabel} {year}】，看表格总行数，和上面Total Plan Rows对比。数字不一样，说明Dashboard逻辑有bug。下面列表是本页面计算出来全部Plan明细。
          </div>

          <div className="border rounded overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="p-2 text-center w-12">No.</th>
                  <th className="p-2 text-left">Branch Name</th>
                  <th className="p-2 text-left">Company</th>
                  <th className="p-2 text-center">Service</th>
                </tr>
              </thead>
              <tbody>
                {dashboardPlanRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-400">
                      No Plan Schedule for {monthLabel} {year}
                    </td>
                  </tr>
                ):(
                  dashboardPlanRows.map((row,idx)=>(
                    <tr key={row.id} className={idx%2===0?'bg-white':'bg-gray-50'}>
                      <td className="p-2 text-center text-gray-500">{idx+1}</td>
                      <td className="p-2">{row.branchName}</td>
                      <td className="p-2">{row.companyName}</td>
                      <td className="p-2 text-center font-semibold">{row.serviceType}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
