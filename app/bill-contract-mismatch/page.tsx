'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ========== 和DashboardStateWrapper完全一样的类型 & 工具函数，直接复制复用，保证逻辑统一 ==========
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
  description: string | null
  agent: string | null
  area: string | null
  project: string | null
  total: number | null
  branch_name: string | null
  service_type: string | null
}

type BillMatchItem = {
  billId: bigint
  branchName: string
  serviceType: string
  docNo: string | null
  billDate: string | null
  scheduleRef: string | null
  monthRaw: string | null
  description: string | null
  total: number | null
  refYear: number
  refMonth: number
  matchKey: string
  isMatched: boolean
}

// ✅ 拆分 & 分隔的多服务类型
function splitServiceTypes(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split('&').map(s => s.trim()).filter(Boolean)
}

// ✅ 根据description自动识别service_type（CONTRACT用）
function getBillJobType(descRaw: string | null, total: number | null): string | null {
  if (!descRaw) return null
  const d = descRaw.trim().toUpperCase()
  if (d.includes('KITCHEN PIPELINE MANAGEMENT')) return 'KPM'
  if (d.includes('GREASE WASTE MANAGEMENT')) return 'GWM'
  if (d.includes('PLUMBING')) {
    if (total && total >= 1500) {
      return 'KPM'
    } else {
      return 'KPS'
    }
  }
  if (d.includes('KITCHEN PIPELINE SERVICE')) return 'KPS'
  if (d.includes('GREASE TRAP CLEARANCE')) return 'GTC'
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
  const parts = monthStr.split('&').map(s => s.trim()).filter(Boolean)
  const isMultiMonth = parts.length > 1
  for (const s of parts) {
    // dd/mm/yyyy
    const dateSlashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (dateSlashMatch) {
      const m = parseInt(dateSlashMatch[2], 10)
      const y = parseInt(dateSlashMatch[3], 10)
      if (m >= 1 && m <= 12 && y >= 2020) {
        results.push({ year: y, month: m })
      }
      continue
    }
    // 2026-01
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10)
      const m = parseInt(isoMatch[2], 10)
      if (m >= 1 && m <= 12 && y >= 2020) {
        results.push({ year: y, month: m })
      }
      continue
    }
    // Jan-26
    const abbrMatch = s.match(/^([A-Za-z]{3})-(\d{2})$/)
    if (abbrMatch) {
      const abbr = abbrMatch[1]
      const yy = parseInt(abbrMatch[2], 10)
      const m = monthAbbrMap[abbr]
      if (m) {
        const fullYear = 2000 + yy
        results.push({ year: fullYear, month: m })
      }
    }
  }
  return { list: results, isMultiMonth, originalText: monthStr.trim() }
}

// 从 contract_no 提取服务类型 GWM / KPM / KPS / GTC
function extractServiceFromContractNo(no: string | null | undefined): string | null {
  if (!no) return null
  const seg = String(no).split('-')
  if (seg.length < 2) return null
  const s = seg[1].trim()
  if (['GWM', 'KPM', 'KPS', 'GTC'].includes(s)) return s
  return null
}

// 和Dashboard一模一样：判断合约在targetY‑targetM是否产出计划
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
    const p = startDateStr.trim().split('-').map(Number)
    const sy = p[0], sm = p[1]
    if (!isNaN(sy) && !isNaN(sm)) {
      startYM = sy * 12 + sm
    }
  }
  let endYM = Infinity
  if (endDateStr && endDateStr.trim()) {
    const p = endDateStr.trim().split('-').map(Number)
    const ey = p[0], em = p[1]
    if (!isNaN(ey) && !isNaN(em)) {
      endYM = ey * 12 + em
    }
  }
  if (targetYM < startYM || targetYM > endYM) return false

  if (monthOfYear && monthOfYear.trim()) {
    const arr = monthOfYear.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    return arr.includes(targetMonth)
  }
  if (freq === 'monthly') return true
  if (freq === 'quarterly') return [1, 4, 7, 10].includes(targetMonth)
  if (freq === 'half_year') return [1, 7].includes(targetMonth)
  return false
}

// ========== 页面组件 ==========
export default function BillContractMismatchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isBoss = searchParams.get('isBoss') === 'true'

  // 最小检查年份
  const [filterMinYear, setFilterMinYear] = useState<number>(2026)
  const [loading, setLoading] = useState(false)
  const [rawAllBills, setRawAllBills] = useState<MaintenanceBillRow[]>([])
  const [contracts, setContracts] = useState<ContractBranchRow[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: billData, error: billErr } = await supabase.from('maintenance_bills').select('*')
      if (billErr) throw billErr
      const { data: ctData, error: ctErr } = await supabase.from('contract_branch').select('*').eq('status', 'active')
      if (ctErr) throw ctErr

      setRawAllBills(billData as MaintenanceBillRow[])
      setContracts(ctData as ContractBranchRow[])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // 筛选：project包含CONTRACT的工单
  const contractBills = useMemo(() => {
    return rawAllBills.filter(bill => {
      if (!bill.project) return false
      return bill.project.trim().toUpperCase().includes('CONTRACT')
    })
  }, [rawAllBills])

  // 构建全部active合约的计划Key集合 branch|service|yyyy‑MM
  const contractPlanKeySet = useMemo(() => {
    const keySet = new Set<string>()
    contracts.forEach(ct => {
      const bName = ct.branch_name?.trim()
      const srv = extractServiceFromContractNo(ct.contract_no)
      if (!bName || !srv) return
      if (!ct.start_date || !ct.end_date) return

      const startD = new Date(ct.start_date)
      const endD = new Date(ct.end_date)
      if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return

      const rawYStart = startD.getFullYear()
      const yStart = Math.max(rawYStart, filterMinYear)
      const yEnd = endD.getFullYear()
      if (yStart > yEnd) return

      for (let y = yStart; y <= yEnd; y++) {
        for (let m = 1; m <= 12; m++) {
          if (isWorkInMonth(ct.frequency, y, m, ct.start_date, ct.end_date, ct.status, ct.month_of_year)) {
            const ymKey = `${y}-${String(m).padStart(2, '0')}`
            const finalKey = `${bName}|${srv}|${ymKey}`
            keySet.add(finalKey)
          }
        }
      }
    })
    return keySet
  }, [contracts, filterMinYear])

  // 处理工单：解析年月、服务，生成matchKey，对比合约集合
  const billMatchList: BillMatchItem[] = useMemo(() => {
    const res: BillMatchItem[] = []
    contractBills.forEach(bill => {
      const bName = bill.branch_name?.trim()
      if (!bName) return

      // 获取服务：优先bill.service_type，没有则description推导（和dashboard一致）
      let rawJobStr = bill.service_type
      if (!rawJobStr) {
        rawJobStr = getBillJobType(bill.description, bill.total)
      }
      if (!rawJobStr) return
      const jobList = splitServiceTypes(rawJobStr)
      if (jobList.length === 0) return

      // 取ref字段：优先schedule_month_ref，没有fallback month（同dashboard）
      const refRaw = bill.schedule_month_ref ?? bill.month
      const parseResult = parseBillMonth(refRaw)
      if (parseResult.list.length === 0) return

      // 一条工单可以对应多个年月（&分割），多条记录
      for (const refItem of parseResult.list) {
        const { year: refY, month: refM } = refItem
        if (refY < filterMinYear) continue

        for (const srv of jobList) {
          const ymStr = `${refY}-${String(refM).padStart(2, '0')}`
          const matchKey = `${bName}|${srv}|${ymStr}`
          const isMatched = contractPlanKeySet.has(matchKey)

          res.push({
            billId: bill.id,
            branchName: bName,
            serviceType: srv,
            docNo: bill.doc_no,
            billDate: bill.bill_date,
            scheduleRef: bill.schedule_month_ref,
            monthRaw: bill.month,
            description: bill.description,
            total: bill.total,
            refYear: refY,
            refMonth: refM,
            matchKey,
            isMatched
          })
        }
      }
    })
    return res
  }, [contractBills, contractPlanKeySet, filterMinYear])

  const mismatchList = billMatchList.filter(x => !x.isMatched) // ✅ 没有匹配到：多余CONTRACT工单，就是你要的
  const matchedList = billMatchList.filter(x => x.isMatched)

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold">CONTRACT Bills vs Contract‑Branch Mismatch Check</h1>
          <p className="text-sm text-gray-500">
            Find CONTRACT maintenance bills which CANNOT match any active contract‑branch plan.
          </p>
          <div className="mt-2 p-2 bg-slate-100 rounded text-xs font-mono">
            Filter Min Year: {filterMinYear} |
            raw bills from DB: {rawAllBills.length} |
            filtered contract bills: {contractBills.length} |
            parsed valid bill‑key items: {billMatchList.length} |
            <span className="text-green-600"> Matched: {matchedList.length}</span> |
            <span className="text-red-600"> Mismatch(Un‑used Extra Bill): {mismatchList.length}</span>
          </div>
        </div>
        <button onClick={() => router.back()} className="px-4 py-2 border rounded hover:bg-gray-100">← Back</button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium">Minimum Check Year:</label>
        <select
          value={filterMinYear}
          onChange={(e) => setFilterMinYear(Number(e.target.value))}
          className="border px-2 py-1 rounded text-sm"
        >
          <option value={2024}>2024</option>
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
          <option value={2028}>2028</option>
          <option value={2029}>2029</option>
          <option value={2030}>2030</option>
        </select>
        <button
          onClick={loadData}
          disabled={loading}
          className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Reload Contract & CONTRACT Bills'}
        </button>
      </div>

      {/* ====== Mismatch：没有匹配合约计划的工单【你重点看这里】====== */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2 text-red-600">⚠️ Mismatch Bills (No corresponding active contract plan found — Un‑used extra CONTRACT bill)</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-red-50 text-red-800">
              <tr>
                <th className="p-2 text-left">Bill Id</th>
                <th className="p-2 text-left">Branch Name</th>
                <th className="p-2 text-left">Service Type</th>
                <th className="p-2 text-left">Doc No</th>
                <th className="p-2 text-left">Bill Date</th>
                <th className="p-2 text-left">Schedule / Month</th>
                <th className="p-2 text-left">Match‑Key</th>
                <th className="p-2 text-left">Amount</th>
                <th className="p-2 text-left">Description</th>
              </tr>
            </thead>
            <tbody>
              {mismatchList.length === 0 ? (
                <tr><td colSpan={9} className="p-4 text-center text-gray-400">No un‑used extra CONTRACT bills found</td></tr>
              ) : (
                mismatchList.map((item) => (
                  <tr key={`${item.billId}-${item.matchKey}`} className="bg-white">
                    <td className="p-2">{String(item.billId)}</td>
                    <td className="p-2">{item.branchName ?? '-'}</td>
                    <td className="p-2 font-semibold">{item.serviceType ?? '-'}</td>
                    <td className="p-2">{item.docNo ?? '-'}</td>
                    <td className="p-2">{item.billDate ?? '-'}</td>
                    <td className="p-2">{item.scheduleRef ?? item.monthRaw ?? '-'}</td>
                    <td className="p-2 font-mono text-xs">{item.matchKey}</td>
                    <td className="p-2">{item.total ?? '-'}</td>
                    <td className="p-2 max-w-52 truncate">{item.description ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 匹配成功参考表 */}
      <div>
        <h2 className="text-lg font-semibold mb-2 text-green-700">✅ Matched Bills (Has corresponding contract‑branch plan)</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-green-50 text-green-800">
              <tr>
                <th className="p-2 text-left">Bill Id</th>
                <th className="p-2 text-left">Branch Name</th>
                <th className="p-2 text-left">Service Type</th>
                <th className="p-2 text-left">Doc No</th>
                <th className="p-2 text-left">Schedule / Month</th>
                <th className="p-2 text-left">Match‑Key</th>
              </tr>
            </thead>
            <tbody>
              {matchedList.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-gray-400">No matched bills</td></tr>
              ) : (
                matchedList.map((item) => (
                  <tr key={`${item.billId}-${item.matchKey}`} className="bg-white">
                    <td className="p-2">{String(item.billId)}</td>
                    <td className="p-2">{item.branchName ?? '-'}</td>
                    <td className="p-2 font-semibold">{item.serviceType ?? '-'}</td>
                    <td className="p-2">{item.docNo ?? '-'}</td>
                    <td className="p-2">{item.scheduleRef ?? item.monthRaw ?? '-'}</td>
                    <td className="p-2 font-mono text-xs">{item.matchKey}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
