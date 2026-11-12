'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractBranchRow = {
  id: bigint
  contract_no: string | null | undefined
  branch_name: string | null
  frequency: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  month_of_year: string | null
}

type MaintenanceBillRow = {
  id: bigint
  branch_name: string | null
  project: string | null
  service_type: string | null
  schedule_month_ref: string | null
  month: string | null
  doc_no: string | null
  bill_date: string | null
  description: string | null
  total: number | null
}

function splitServiceTypes(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split('&').map(s => s.trim()).filter(Boolean)
}

function getBillJobType(descRaw: string | null, total: number | null): string | null {
  if (!descRaw) return null
  const d = descRaw.trim().toUpperCase()
  if (d.includes('KITCHEN PIPELINE MANAGEMENT')) return 'KPM'
  if (d.includes('GREASE WASTE MANAGEMENT')) return 'GWM'
  if (d.includes('PLUMBING')) {
    if (total && total >= 1500) return 'KPM'
    return 'KPS'
  }
  if (d.includes('KITCHEN PIPELINE SERVICE')) return 'KPS'
  if (d.includes('GREASE TRAP CLEARANCE')) return 'GTC'
  return null
}

const monthAbbrMap: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
}

type ParsedMonthItem = { year: number; month: number }
type ParseResult = { list: ParsedMonthItem[]; isMultiMonth: boolean; originalText: string }

function parseBillMonth(monthStr: string | null): ParseResult {
  if (!monthStr) return { list: [], isMultiMonth: false, originalText: '' }
  const parts = monthStr.split('&').map(s => s.trim()).filter(Boolean)
  const isMultiMonth = parts.length > 1
  const results: ParsedMonthItem[] = []

  for (const s of parts) {
    // DD/MM/YYYY
    const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (dmy) {
      const m = parseInt(dmy[2], 10)
      const y = parseInt(dmy[3], 10)
      if (m >= 1 && m <= 12 && y >= 2020) results.push({ year: y, month: m })
      continue
    }

    // YYYY-MM
    const iso = s.match(/^(\d{4})-(\d{1,2})$/)
    if (iso) {
      const y = parseInt(iso[1], 10)
      const m = parseInt(iso[2], 10)
      if (m >= 1 && m <= 12 && y >= 2020) results.push({ year: y, month: m })
      continue
    }

    // Jan-26 (2位年份)
    const abbr2 = s.match(/^([A-Za-z]{3})[- ](\d{2})$/)
    if (abbr2) {
      const mStr = abbr2[1]
      const yy = parseInt(abbr2[2], 10)
      const m = monthAbbrMap[mStr]
      if (m) results.push({ year: 2000 + yy, month: m })
      continue
    }

    // Jan 2026 / Jan-2026 (4位年份，重点新增)
    const abbr4 = s.match(/^([A-Za-z]{3})[- ](\d{4})$/)
    if (abbr4) {
      const mStr = abbr4[1]
      const y = parseInt(abbr4[2], 10)
      const m = monthAbbrMap[mStr]
      if (m && y >= 2020) results.push({ year: y, month: m })
    }
  }

  return { list: results, isMultiMonth, originalText: monthStr.trim() }
}

function extractServiceFromContractNo(no: string | null | undefined): string | null {
  if (!no) return null
  const seg = String(no).split('-')
  if (seg.length < 2) return null
  const s = seg[1].trim()
  if (['GWM', 'KPM', 'KPS', 'GTC'].includes(s)) return s
  return null
}

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
  let endYM = Infinity

  if (startDateStr?.trim()) {
    const p = startDateStr.trim().split('-').map(Number)
    const sy = p[0]
    const sm = p[1]
    if (!Number.isNaN(sy) && !Number.isNaN(sm)) startYM = sy * 12 + sm
  }

  if (endDateStr?.trim()) {
    const p = endDateStr.trim().split('-').map(Number)
    const ey = p[0]
    const em = p[1]
    if (!Number.isNaN(ey) && !Number.isNaN(em)) endYM = ey * 12 + em
  }

  if (targetYM < startYM || targetYM > endYM) return false

  if (monthOfYear?.trim()) {
    const arr = monthOfYear.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !Number.isNaN(n))
    return arr.includes(targetMonth)
  }

  if (freq === 'monthly') return true
  if (freq === 'quarterly') return [1, 4, 7, 10].includes(targetMonth)
  if (freq === 'half_year') return [1, 7].includes(targetMonth)

  return false
}

export default function BillContractMismatchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isBoss = searchParams.get('isBoss') === 'true'

  const [filterYear, setFilterYear] = useState<number>(2026)
  const [strictMatch, setStrictMatch] = useState<boolean>(true)
  const [loading, setLoading] = useState(false)
  const [rawAllBills, setRawAllBills] = useState<MaintenanceBillRow[]>([])
  const [rawBillTotalCount, setRawBillTotalCount] = useState<number | null>(null)
  const [contracts, setContracts] = useState<ContractBranchRow[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      // 👉 单独查询总数量，head:true 不返回行，拿到真实总数
      const { count: exactCount, error: countErr } = await supabase
        .from('maintenance_bills')
        .select('*', { count: 'exact', head: true })

      if (countErr) {
        console.warn('⚠️ Count query failed, fallback to array length', countErr)
        setRawBillTotalCount(null)
      } else {
        setRawBillTotalCount(exactCount)
      }

      // 👉 原有明细读取（用于比对逻辑，保留原有1000limit）
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

  const contractBills = useMemo(() => {
    return rawAllBills.filter(b => {
      if (!b.project) return false
      const projUpper = b.project.toUpperCase()

      // 👉 CONTRACT：直接纳入
      const isContract = projUpper.includes('CONTRACT')
      // 👉 WARRANTY：必须 schedule_month_ref 以及 service_type 都不为空才纳入
      const isWarranty = projUpper.includes('WARRANTY')
      if (isWarranty) {
        if (!b.schedule_month_ref || !b.service_type) return false
      }

      if (!isContract && !isWarranty) return false

      const refRaw = b.schedule_month_ref ?? b.month
      const parseRes = parseBillMonth(refRaw)
      return parseRes.list.some(item => item.year === filterYear)
    })
  }, [rawAllBills, filterYear])

  const contractPlanKeySet = useMemo(() => {
    const ks = new Set<string>()
    const ksLoose = new Set<string>()
    contracts.forEach(ct => {
      const bName = ct.branch_name?.trim()
      const srv = extractServiceFromContractNo(ct.contract_no)
      if (!bName || !srv || !ct.start_date || !ct.end_date) {
        console.log('⚠️ Contract skip: missing data', ct)
        return
      }

      const sD = new Date(ct.start_date)
      const eD = new Date(ct.end_date)
      if (Number.isNaN(sD.getTime()) || Number.isNaN(eD.getTime())) return

      const yStart = Math.max(sD.getFullYear(), filterYear)
      const yEnd = Math.min(eD.getFullYear(), filterYear)
      if (yStart > yEnd) return

      for (let y = yStart; y <= yEnd; y++) {
        for (let m = 1; m <= 12; m++) {
          if (isWorkInMonth(ct.frequency, y, m, ct.start_date, ct.end_date, ct.status, ct.month_of_year)) {
            const ym = `${y}-${String(m).padStart(2, '0')}`
            const key = `${bName}|${srv}|${ym}`
            ks.add(key)
            // 宽松版本：全部小写、去空格
            const looseKey = `${bName.toLowerCase().trim()}|${srv.toLowerCase().trim()}|${ym}`
            ksLoose.add(looseKey)
          }
        }
      }
    })
    console.log('✅ Contract Strict Keys:', Array.from(ks))
    console.log('✅ Contract Loose Keys:', Array.from(ksLoose))
    return { strict: ks, loose: ksLoose }
  }, [contracts, filterYear])

  const billRowsWithCalc = useMemo(() => {
    return contractBills.map(bill => {
      const bName = bill.branch_name?.trim() ?? ''
      let rawJobStr = bill.service_type
      if (!rawJobStr) rawJobStr = getBillJobType(bill.description, bill.total)
      const jobList = splitServiceTypes(rawJobStr)

      const refRaw = bill.schedule_month_ref ?? bill.month
      const parseRes = parseBillMonth(refRaw)

      const computedKeys: { key: string; looseKey: string; isMatched: boolean }[] = []
      for (const item of parseRes.list) {
        if (item.year !== filterYear) continue
        for (const s of jobList) {
          const ymStr = `${item.year}-${String(item.month).padStart(2, '0')}`
          const k = `${bName}|${s}|${ymStr}`
          const looseK = `${bName.toLowerCase().trim()}|${s.toLowerCase().trim()}|${ymStr}`
          const matched = strictMatch
            ? contractPlanKeySet.strict.has(k)
            : contractPlanKeySet.loose.has(looseK)
          computedKeys.push({ key: k, looseKey: looseK, isMatched: matched })
        }
      }

      const anyMatched = computedKeys.some(x => x.isMatched)
      if (computedKeys.length > 0) {
        console.log('🧾 Bill', bill.id, 'keys:', computedKeys)
      }

      // 标记项目类型
      const projUpper = bill.project?.toUpperCase() ?? ''
      const projectType = projUpper.includes('WARRANTY') ? 'WARRANTY' : 'CONTRACT'

      return {
        ...bill,
        projectType,
        computedKeys,
        anyMatched,
      }
    })
  }, [contractBills, contractPlanKeySet, filterYear, strictMatch])

  const matchedCount = billRowsWithCalc.filter(x => x.anyMatched).length
  const mismatchCount = billRowsWithCalc.filter(x => !x.anyMatched).length
  // 优先使用精确count，count查询失败时兜底用数组长度
  const displayRawBillCount = rawBillTotalCount ?? rawAllBills.length

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">CONTRACT & WARRANTY Bills vs Contract Plan Checker</h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  View CONTRACT bills + valid WARRANTY bills and check which ones have no matching active contract plan.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Raw Bills</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{displayRawBillCount}</div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Filtered Bills ({filterYear})</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{contractBills.length}</div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-emerald-200">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Matched</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-600">{matchedCount}</div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-rose-200">
            <div className="text-xs font-medium uppercase tracking-wide text-rose-700">No Plan Match</div>
            <div className="mt-1 text-2xl font-semibold text-rose-600">{mismatchCount}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700">Select Year:</label>
              <select
                value={filterYear}
                onChange={e => setFilterYear(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
                <option value={2028}>2028</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={strictMatch}
                onChange={e => setStrictMatch(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Strict Match (case & space sensitive)
            </label>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Loading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload Data
              </>
            )}
          </button>
        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="whitespace-nowrap px-4 py-3">Bill Id</th>
                  <th className="whitespace-nowrap px-4 py-3">Branch Name</th>
                  <th className="whitespace-nowrap px-4 py-3">Service Type</th>
                  <th className="whitespace-nowrap px-4 py-3">Project Type</th>
                  <th className="whitespace-nowrap px-4 py-3">Project</th>
                  <th className="whitespace-nowrap px-4 py-3">Schedule Month Ref</th>
                  <th className="whitespace-nowrap px-4 py-3">Month</th>
                  <th className="whitespace-nowrap px-4 py-3">Doc No</th>
                  <th className="whitespace-nowrap px-4 py-3">Description</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                  <th className="whitespace-nowrap px-4 py-3">Match Keys</th>
                  <th className="whitespace-nowrap px-4 py-3">Debug Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {billRowsWithCalc.map((row, idx) => (
                  <tr key={Number(row.id)} className={`transition hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{String(row.id)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{row.branch_name ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.service_type ? (
                        <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                          {row.service_type}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        row.projectType === 'WARRANTY'
                          ? 'bg-amber-50 text-amber-700 ring-amber-200'
                          : 'bg-sky-50 text-sky-700 ring-sky-200'
                      }`}>
                        {row.projectType}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.project ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{row.schedule_month_ref ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{row.month ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{row.doc_no ?? '-'}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-slate-600" title={row.description ?? ''}>
                      {row.description ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-slate-700">
                      {row.total != null ? Number(row.total).toLocaleString() : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.computedKeys.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3L13.73 4a2 2 0 00-3.46 0L3.2 16a2 2 0 001.73 3z" />
                          </svg>
                          Skipped
                        </span>
                      ) : row.anyMatched ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          No Plan Match
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.computedKeys.length === 0 ? (
                        <span className="text-xs text-slate-400">Branch/service/month not valid</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {row.computedKeys.map((kk, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs ring-1 ring-inset ${
                                kk.isMatched
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                  : 'bg-rose-50 text-rose-700 ring-rose-200'
                              }`}
                            >
                              <span className={kk.isMatched ? 'text-emerald-500' : 'text-rose-500'}>
                                {kk.isMatched ? '✓' : '✗'}
                              </span>
                              {kk.key}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      {row.computedKeys.length > 0 ? (
                        <div className="text-xs font-mono text-slate-500 break-all">
                          {row.computedKeys.map(k => k.looseKey).join(' | ')}
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                ))}

                {billRowsWithCalc.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-16 text-center text-sm text-slate-500">
                      No CONTRACT / valid WARRANTY bills found for selected year.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">How to use</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Select Year: only show bills whose schedule month is exactly this year.</li>
            <li><strong>CONTRACT</strong>: Any project containing CONTRACT will be included.</li>
            <li><strong>WARRANTY</strong>: Only included when schedule_month_ref AND service_type are not empty.</li>
            <li><strong>Strict Match ON</strong> : exact string match (case, space, bracket sensitive)</li>
            <li><strong>Strict Match OFF</strong> : ignore case & extra space, easier to catch name mismatch</li>
            <li><strong>No Plan Match</strong> means the bill could not be linked to any active contract-branch plan.</li>
            <li>Each computed key follows the format <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">branch | service | yyyy-MM</code>.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
