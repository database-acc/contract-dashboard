'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractRow = {
  id: number
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

type MonthStat = {
  monthNum: number
  monthLabel: string
  total: number
  gwm: number
  kpm: number
  kps: number
  gtc: number
  branches: number
}

const MONTHS = [
  { num: 1, label: 'Jan' }, { num: 2, label: 'Feb' }, { num: 3, label: 'Mar' },
  { num: 4, label: 'Apr' }, { num: 5, label: 'May' }, { num: 6, label: 'Jun' },
  { num: 7, label: 'Jul' }, { num: 8, label: 'Aug' }, { num: 9, label: 'Sep' },
  { num: 10, label: 'Oct' }, { num: 11, label: 'Nov' }, { num: 12, label: 'Dec' },
]

// 和 Dashboard 的 isWorkInMonth 完全一致
function isWorkInMonth(
  freq: string | null,
  year: number,
  month: number,
  startDate: string | null,
  endDate: string | null,
  status: string | null,
  monthOfYear: string | null
): boolean {
  if (status !== 'active') return false
  const targetYM = year * 12 + month

  let startYM = -Infinity
  if (startDate) {
    const [sy, sm] = startDate.split('-').map(Number)
    if (!isNaN(sy) && !isNaN(sm)) startYM = sy * 12 + sm
  }
  let endYM = Infinity
  if (endDate) {
    const [ey, em] = endDate.split('-').map(Number)
    if (!isNaN(ey) && !isNaN(em)) endYM = ey * 12 + em
  }
  if (targetYM < startYM || targetYM > endYM) return false

  if (monthOfYear && monthOfYear.trim()) {
    const months = monthOfYear.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    return months.includes(month)
  }
  if (freq === 'monthly') return true
  if (freq === 'quarterly') return [1, 4, 7, 10].includes(month)
  if (freq === 'half_year') return [1, 7].includes(month)
  return false
}

function extractService(contractNo: string | null): string | null {
  if (!contractNo) return null
  const parts = contractNo.split('-')
  if (parts.length >= 2) {
    const t = parts[1].trim()
    if (['GWM', 'KPM', 'KPS', 'GTC'].includes(t)) return t
  }
  return null
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [rows, setRows] = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contract_branch')
      .select('*')
      .eq('status', 'active')
    if (error) {
      alert('读取失败: ' + error.message)
      setLoading(false)
      return
    }
    setRows((data as ContractRow[]) || [])
    setLoading(false)
    setLoaded(true)
  }

  const monthlyStats: MonthStat[] = useMemo(() => {
    if (!rows.length) return []
    return MONTHS.map(m => {
      let total = 0, gwm = 0, kpm = 0, kps = 0, gtc = 0
      const branchSet = new Set<string>()
      rows.forEach(r => {
        const ok = isWorkInMonth(r.frequency, year, m.num, r.start_date, r.end_date, r.status, r.month_of_year)
        if (!ok) return
        const svc = extractService(r.contract_no)
        if (!svc) return
        total++
        if (svc === 'GWM') gwm++
        if (svc === 'KPM') kpm++
        if (svc === 'KPS') kps++
        if (svc === 'GTC') gtc++
        if (r.branch_name) branchSet.add(r.branch_name)
      })
      return {
        monthNum: m.num,
        monthLabel: m.label,
        total,
        gwm, kpm, kps, gtc,
        branches: branchSet.size,
      }
    })
  }, [rows, year])

  const grandTotal = monthlyStats.reduce((s, m) => s + m.total, 0)
  const totalGWM = monthlyStats.reduce((s, m) => s + m.gwm, 0)
  const totalKPM = monthlyStats.reduce((s, m) => s + m.kpm, 0)
  const totalKPS = monthlyStats.reduce((s, m) => s + m.kps, 0)
  const totalGTC = monthlyStats.reduce((s, m) => s + m.gtc, 0)

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker</h1>
          <p className="text-sm text-gray-500">
            Plan Schedule Count — calculated from contract_branch (frequency / times_per_year / schedule_rule)
          </p>
        </div>
        <button onClick={() => router.back()} className="px-4 py-2 border rounded hover:bg-gray-100">
          ← Back
        </button>
      </div>

      <div className="flex gap-3 items-center mb-6">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border px-3 py-2 rounded"
        >
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
          <option value={2028}>2028</option>
        </select>
        <button
          onClick={loadData}
          disabled={loading}
          className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load & Calculate'}
        </button>
      </div>

      {loaded && (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="border rounded p-4 bg-slate-50">
              <div className="text-xs text-gray-500">Total Plans ({year})</div>
              <div className="text-2xl font-bold">{grandTotal}</div>
            </div>
            <div className="border rounded p-4 bg-sky-50">
              <div className="text-xs text-sky-600">GWM</div>
              <div className="text-2xl font-bold text-sky-700">{totalGWM}</div>
            </div>
            <div className="border rounded p-4 bg-violet-50">
              <div className="text-xs text-violet-600">KPM</div>
              <div className="text-2xl font-bold text-violet-700">{totalKPM}</div>
            </div>
            <div className="border rounded p-4 bg-emerald-50">
              <div className="text-xs text-emerald-600">KPS</div>
              <div className="text-2xl font-bold text-emerald-700">{totalKPS}</div>
            </div>
            <div className="border rounded p-4 bg-amber-50">
              <div className="text-xs text-amber-600">GTC</div>
              <div className="text-2xl font-bold text-amber-700">{totalGTC}</div>
            </div>
          </div>

          {/* 月度明细表 */}
          <div className="border rounded overflow-x-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="p-2 text-center w-12">No.</th>
                  <th className="p-2 text-left">Month</th>
                  <th className="p-2 text-center">Total Plans</th>
                  <th className="p-2 text-center">GWM</th>
                  <th className="p-2 text-center">KPM</th>
                  <th className="p-2 text-center">KPS</th>
                  <th className="p-2 text-center">GTC</th>
                  <th className="p-2 text-center">Unique Branches</th>
                </tr>
              </thead>
              <tbody>
                {monthlyStats.map((m, idx) => (
                  <tr key={m.monthNum} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                    <td className="p-2 font-medium">{m.monthLabel} {year}</td>
                    <td className="p-2 text-center font-bold">{m.total}</td>
                    <td className="p-2 text-center text-sky-700">{m.gwm || '-'}</td>
                    <td className="p-2 text-center text-violet-700">{m.kpm || '-'}</td>
                    <td className="p-2 text-center text-emerald-700">{m.kps || '-'}</td>
                    <td className="p-2 text-center text-amber-700">{m.gtc || '-'}</td>
                    <td className="p-2 text-center text-gray-500">{m.branches}</td>
                  </tr>
                ))}
                {/* 合计行 */}
                <tr className="bg-slate-100 font-bold">
                  <td className="p-2 text-center" colSpan={2}>TOTAL</td>
                  <td className="p-2 text-center">{grandTotal}</td>
                  <td className="p-2 text-center text-sky-700">{totalGWM}</td>
                  <td className="p-2 text-center text-violet-700">{totalKPM}</td>
                  <td className="p-2 text-center text-emerald-700">{totalKPS}</td>
                  <td className="p-2 text-center text-amber-700">{totalGTC}</td>
                  <td className="p-2 text-center">-</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            💡 对比方法：打开 Dashboard，依次选 1-12 月，数表格里总行数（Plan Schedule 列），应该和上面 Total Plans 完全一致。
          </p>
        </>
      )}
    </div>
  )
}
