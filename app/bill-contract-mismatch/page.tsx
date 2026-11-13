'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================================================================== */
/* Types                                                              */
/* ================================================================== */

type ContractBranchRow = {
  id: bigint
  contract_no: string | null
  description: string | null
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

type ReasonCode =
  | 'MATCHED'
  | 'NO_PLAN_FOR_BRANCH'
  | 'SERVICE_NOT_IN_CONTRACT'
  | 'MONTH_NOT_SCHEDULED'
  | 'OTHER'

type PlanInfo = {
  keys: Set<string>
  branchSvcMonths: Map<string, Map<string, Set<number>>>
  contractRows: number
}

type AnalyzedBill = MaintenanceBillRow & {
  projectType: 'CONTRACT' | 'WARRANTY'
  resolvedJobs: string[]
  refMonthRaw: string
  keys: { key: string; matched: boolean }[]
  matched: boolean
  reason: ReasonCode
  hintMonths: number[]
}

/* ================================================================== */
/* Helpers — 与 DashboardStateWrapper 逐字一致                         */
/* ================================================================== */

const pad2 = (n: number) => String(n).padStart(2, '0')

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

type ParsedMonthItem = { year: number; month: number }
type ParseResult = { list: ParsedMonthItem[]; isMultiMonth: boolean; originalText: string }

function parseBillMonth(monthStr: string | null): ParseResult {
  if (!monthStr) return { list: [], isMultiMonth: false, originalText: '' }
  const parts = monthStr.split('&').map(s => s.trim()).filter(Boolean)
  const isMultiMonth = parts.length > 1
  const results: ParsedMonthItem[] = []

  for (const s of parts) {
    // dd/mm/yyyy 或 d/m/yyyy（Dashboard 原版只吃两位，这里放宽到 1-2 位）
    const dateSlashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dateSlashMatch) {
      const m = parseInt(dateSlashMatch[2], 10)
      const y = parseInt(dateSlashMatch[3], 10)
      if (m >= 1 && m <= 12 && y >= 2020) results.push({ year: y, month: m })
      continue
    }
    // 2026-01
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10)
      const m = parseInt(isoMatch[2], 10)
      if (m >= 1 && m <= 12 && y >= 2020) results.push({ year: y, month: m })
      continue
    }
    // Jan-26（注意：绝对不能用 new Date('May-26')，会变 1926）
    const abbrMatch = s.match(/^([A-Za-z]{3})-(\d{2})$/)
    if (abbrMatch) {
      const abbr = abbrMatch[1].charAt(0).toUpperCase() + abbrMatch[1].slice(1).toLowerCase()
      const m = monthAbbrMap[abbr]
      if (m) results.push({ year: 2000 + parseInt(abbrMatch[2], 10), month: m })
    }
  }
  return { list: results, isMultiMonth, originalText: monthStr.trim() }
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
  if (startDateStr && startDateStr.trim()) {
    const p = startDateStr.trim().split('-').map(Number)
    const sy = p[0], sm = p[1]
    if (!isNaN(sy) && !isNaN(sm)) startYM = sy * 12 + sm
  }
  let endYM = Infinity
  if (endDateStr && endDateStr.trim()) {
    const p = endDateStr.trim().split('-').map(Number)
    const ey = p[0], em = p[1]
    if (!isNaN(ey) && !isNaN(em)) endYM = ey * 12 + em
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

/* ================================================================== */
/* Page                                                               */
/* ================================================================== */

const YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028]

const REASON_META: Record<ReasonCode, { label: string; cls: string }> = {
  MATCHED: {
    label: 'Matched',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  NO_PLAN_FOR_BRANCH: {
    label: 'No contract row for this branch',
    cls: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  SERVICE_NOT_IN_CONTRACT: {
    label: 'This service is not in the contract',
    cls: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  MONTH_NOT_SCHEDULED: {
    label: 'Contract does not schedule this month',
    cls: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  OTHER: {
    label: 'Not matched',
    cls: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
}

export default function BillContractMismatchPage() {
  const router = useRouter()

  const [planYear, setPlanYear] = useState<number>(2026)
  const [includeWarranty, setIncludeWarranty] = useState(false)
  const [mode, setMode] = useState<'unmatched' | 'matched' | 'all'>('unmatched')
  const [search, setSearch] = useState('')

  const [bills, setBills] = useState<MaintenanceBillRow[]>([])
  const [contracts, setContracts] = useState<ContractBranchRow[]>([])
  const [rawBillCount, setRawBillCount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  /* ---------------- data loading（分页拿全量，避免 Max Rows=1000 截断） ---------------- */
  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { count, error: countErr } = await supabase
        .from('maintenance_bills')
        .select('*', { count: 'exact', head: true })
      if (countErr) throw countErr
      setRawBillCount(count ?? 0)

      const pageSize = 1000
      const allBills: MaintenanceBillRow[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('maintenance_bills')
          .select('id, branch_name, project, service_type, schedule_month_ref, month, doc_no, bill_date, description, total')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) throw error
        const chunk = (data ?? []) as unknown as MaintenanceBillRow[]
        if (chunk.length === 0) break
        allBills.push(...chunk)
        from += chunk.length
        if (from > 100000) break
      }
      setBills(allBills)

      const allContracts: ContractBranchRow[] = []
      from = 0
      while (true) {
        const { data, error } = await supabase
          .from('contract_branch')
          .select('id, contract_no, description, branch_name, frequency, start_date, end_date, status, month_of_year')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) throw error
        const chunk = (data ?? []) as unknown as ContractBranchRow[]
        if (chunk.length === 0) break
        allContracts.push(...chunk)
        from += chunk.length
        if (from > 100000) break
      }
      setContracts(allContracts)
    } catch (e: any) {
      console.error(e)
      setLoadError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  /* ---------------- Plan index：branch | service | yyyy-MM ---------------- */
  const planIndex = useMemo(() => {
    const map = new Map<number, PlanInfo>()
    for (let y = 2024; y <= 2028; y++) {
      const keys = new Set<string>()
      const branchSvcMonths = new Map<string, Map<string, Set<number>>>()
      let contractRows = 0

      contracts.forEach(ct => {
        const bName = ct.branch_name?.trim()
        if (!bName) return
        // ✅ 按用户要求：service 从 description 解析（不再读 contract_no）
        const service = getBillJobType(ct.description, null)
        if (!service || !['GWM', 'KPM', 'KPS', 'GTC'].includes(service)) return

        let used = false
        for (let m = 1; m <= 12; m++) {
          if (!isWorkInMonth(ct.frequency, y, m, ct.start_date, ct.end_date, ct.status, ct.month_of_year)) continue
          used = true
          keys.add(`${bName}|${service}|${y}-${pad2(m)}`)

          let svcMap = branchSvcMonths.get(bName)
          if (!svcMap) {
            svcMap = new Map<string, Set<number>>()
            branchSvcMonths.set(bName, svcMap)
          }
          let monthSet = svcMap.get(service)
          if (!monthSet) {
            monthSet = new Set<number>()
            svcMap.set(service, monthSet)
          }
          monthSet.add(m)
        }
        if (used) contractRows += 1
      })

      map.set(y, { keys, branchSvcMonths, contractRows })
    }
    return map
  }, [contracts])

  const currentPlan = planIndex.get(planYear) as PlanInfo

  /* ---------------- 工单 → 是否被计划接住 ---------------- */
  const analysis = useMemo(() => {
    const plan = currentPlan
    const skipped: Record<string, number> = {}
    const bump = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1 }

    let contractBillsAllYears = 0
    const rows: AnalyzedBill[] = []

    bills.forEach(bill => {
      if (!bill.branch_name || !bill.project) {
        bump('missing branch / project')
        return
      }
      const bName = bill.branch_name.trim()
      const projectTrim = bill.project.trim().toUpperCase()
      const isContract = projectTrim.includes('CONTRACT')
      const isWarranty = projectTrim.includes('WARRANTY')
      if (!isContract && !isWarranty) return
      if (isContract) contractBillsAllYears += 1

      // WARRANTY 硬性规则（与 Dashboard 一致）
      if (isWarranty) {
        if (!bill.schedule_month_ref?.trim() || !bill.service_type?.trim()) {
          bump('WARRANTY missing schedule_month_ref / service_type')
          return
        }
        if (!includeWarranty) {
          bump('WARRANTY excluded by filter')
          return
        }
      }

      // service：先看 service_type，空则从 description 推
      let rawJobStr = bill.service_type?.trim() || ''
      if (!rawJobStr) rawJobStr = getBillJobType(bill.description, bill.total) ?? ''
      if (!rawJobStr) {
        bump('no service type (and description unmatched)')
        return
      }
      const jobs = splitServiceTypes(rawJobStr)
      if (jobs.length === 0) {
        bump('empty service list')
        return
      }

      // ✅ 关键修复：?? 不会回退空字符串，必须用 || 并 trim
      const refMonthRaw = bill.schedule_month_ref?.trim() || bill.month?.trim() || ''
      const refParse = parseBillMonth(refMonthRaw)
      if (refParse.list.length === 0) {
        bump('ref month unparseable')
        return
      }

      // Dashboard 口径：bill.month 解析不了 → 整条剔除
      const billParse = parseBillMonth(bill.month)
      if (billParse.list.length === 0) {
        bump('bill.month unparseable')
        return
      }

      // 严格年份：跨年工单不参与
      const inYear = refParse.list.filter(x => x.year === planYear)
      if (inYear.length === 0) {
        bump('ref month outside plan year')
        return
      }

      const keys: { key: string; matched: boolean }[] = []
      let anyMatched = false
      for (const ref of inYear) {
        for (const job of jobs) {
          const key = `${bName}|${job}|${ref.year}-${pad2(ref.month)}`
          const matched = plan.keys.has(key)
          if (matched) anyMatched = true
          if (!keys.some(k => k.key === key)) keys.push({ key, matched })
        }
      }

      // 未匹配原因 + 该合同实际排期月份（方便人肉核对）
      let reason: ReasonCode = 'MATCHED'
      const svcMap = plan.branchSvcMonths.get(bName)
      let hintMonths: number[] = []
      if (svcMap) {
        const sets: Set<number>[] = []
        jobs.forEach(j => {
          const s = svcMap.get(j)
          if (s) sets.push(s)
        })
        if (sets.length === 0) svcMap.forEach(s => sets.push(s))
        const union = new Set<number>()
        sets.forEach(s => s.forEach(m => union.add(m)))
        hintMonths = Array.from(union).sort((a, b) => a - b)
      }

      if (!anyMatched) {
        if (!svcMap || svcMap.size === 0) reason = 'NO_PLAN_FOR_BRANCH'
        else if (!jobs.some(j => svcMap.has(j))) reason = 'SERVICE_NOT_IN_CONTRACT'
        else if (!inYear.some(r => jobs.some(j => svcMap.get(j)?.has(r.month)))) reason = 'MONTH_NOT_SCHEDULED'
        else reason = 'OTHER'
      }

      rows.push({
        ...bill,
        projectType: isContract ? 'CONTRACT' : 'WARRANTY',
        resolvedJobs: jobs,
        refMonthRaw,
        keys,
        matched: anyMatched,
        reason,
        hintMonths,
      })
    })

    const matchedCount = rows.filter(r => r.matched).length

    return {
      rows,
      validCount: rows.length,
      matchedCount,
      unmatchedCount: rows.length - matchedCount,
      contractBillsAllYears,
      skipped,
    }
  }, [bills, currentPlan, planYear, includeWarranty])

  /* ---------------- 统计 ---------------- */
  const reasonSummary = useMemo(() => {
    const c: Record<string, number> = {}
    analysis.rows.forEach(r => {
      if (r.reason === 'MATCHED') return
      c[r.reason] = (c[r.reason] ?? 0) + 1
    })
    return c
  }, [analysis.rows])

  const byProject = useMemo(() => {
    const c: Record<string, number> = {}
    analysis.rows.forEach(r => {
      if (r.matched) return
      const p = (r.project ?? '-').trim()
      c[p] = (c[p] ?? 0) + 1
    })
    return c
  }, [analysis.rows])

  /* ---------------- 过滤 + 排序 ---------------- */
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return analysis.rows
      .filter(r => {
        if (mode === 'unmatched' && r.matched) return false
        if (mode === 'matched' && !r.matched) return false
        if (!q) return true
        return (
          (r.branch_name ?? '').toLowerCase().includes(q) ||
          (r.project ?? '').toLowerCase().includes(q) ||
          (r.doc_no ?? '').toLowerCase().includes(q) ||
          String(r.id).includes(q)
        )
      })
      .sort((a, b) => {
        const bn = (a.branch_name ?? '').localeCompare(b.branch_name ?? '')
        if (bn !== 0) return bn
        return (a.refMonthRaw ?? '').localeCompare(b.refMonthRaw ?? '')
      })
  }, [analysis.rows, mode, search])

  const yearCoverage = useMemo(() => {
    const out: { year: number; rows: number; keys: number }[] = []
    YEAR_OPTIONS.forEach(y => {
      const p = planIndex.get(y)
      out.push({ year: y, rows: p?.contractRows ?? 0, keys: p?.keys.size ?? 0 })
    })
    return out
  }, [planIndex])

  /* ================================================================== */
  /* Render                                                             */
  /* ================================================================== */

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Contract Bills Not Covered by Contract Plan</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Bill → plan cross-check, same key rule as DashboardStateWrapper: branch | service | yyyy-MM
              </p>
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

        {/* Error banner */}
        {loadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <strong>Load failed:</strong> {loadError}
          </div>
        )}

        {/* 计划年份覆盖不足警告 */}
        {currentPlan.contractRows === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>No active contract row covers {planYear}.</strong>{' '}
            Every bill in {planYear} will be listed as unmatched. Check the coverage table below and record the {planYear} contracts first.
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Raw Bills</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{rawBillCount || bills.length}</div>
            <div className="mt-1 text-xs text-slate-400">rows actually loaded: {bills.length}</div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Contract Bills (all years)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{analysis.contractBillsAllYears}</div>
            <div className="mt-1 text-xs text-slate-400">project contains &quot;CONTRACT&quot;</div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-emerald-200">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Matched ({planYear})</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-600">{analysis.matchedCount}</div>
            <div className="mt-1 text-xs text-emerald-600">of {analysis.validCount} bills in {planYear}</div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-rose-200">
            <div className="text-xs font-medium uppercase tracking-wide text-rose-700">Not Matched ({planYear})</div>
            <div className="mt-1 text-2xl font-semibold text-rose-600">{analysis.unmatchedCount}</div>
            <div className="mt-1 text-xs text-rose-500">bills with no plan slot</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Plan Year:</label>
              <select
                value={planYear}
                onChange={e => setPlanYear(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
              >
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
              {(['unmatched', 'matched', 'all'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-sm font-medium capitalize transition ${
                    mode === m ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeWarranty}
                onChange={e => setIncludeWarranty(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-200"
              />
              Include WARRANTY bills
            </label>

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search branch / project / doc no / id"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />

            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Reload Data'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Plan coverage:</span>
            {yearCoverage.map(c => (
              <span
                key={c.year}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ring-1 ring-inset ${
                  c.year === planYear
                    ? 'bg-rose-50 text-rose-700 ring-rose-200'
                    : 'bg-slate-50 text-slate-600 ring-slate-200'
                }`}
              >
                {c.year}: {c.rows} contracts / {c.keys} keys
              </span>
            ))}
            <span className="text-slate-400">·</span>
            <span>{contracts.length} contract rows loaded</span>
          </div>

          {/* 未匹配原因分布 */}
          {Object.keys(reasonSummary).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
              <span className="font-medium text-slate-700">Why not matched:</span>
              {(Object.keys(reasonSummary) as ReasonCode[]).map(k => (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ring-1 ring-inset ${REASON_META[k].cls}`}
                >
                  {REASON_META[k].label}: {reasonSummary[k]}
                </span>
              ))}
            </div>
          )}

          {/* Project 分布 */}
          {Object.keys(byProject).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-700">By project:</span>
              {Object.entries(byProject)
                .sort((a, b) => b[1] - a[1])
                .map(([p, n]) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sky-700 ring-1 ring-inset ring-sky-200"
                  >
                    {p}: {n}
                  </span>
                ))}
            </div>
          )}

          <button
            onClick={() => setShowDebug(v => !v)}
            className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700"
          >
            {showDebug ? 'Hide' : 'Show'} load diagnostics
          </button>

          {showDebug && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
              <div className="grid gap-1 md:grid-cols-2">
                <span>bills loaded: <strong>{bills.length}</strong> (db count: {rawBillCount || 'n/a'})</span>
                <span>contract rows loaded: <strong>{contracts.length}</strong></span>
                <span>active plan rows for {planYear}: <strong>{currentPlan.contractRows}</strong></span>
                <span>plan keys for {planYear}: <strong>{currentPlan.keys.size}</strong></span>
              </div>
              {Object.keys(analysis.skipped).length > 0 && (
                <div className="mt-2">
                  <div className="font-medium text-slate-700">Skipped bills:</div>
                  <ul className="mt-1 grid gap-0.5 md:grid-cols-2">
                    {Object.entries(analysis.skipped).map(([k, v]) => (
                      <li key={k}>· {k}: <strong>{v}</strong></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="whitespace-nowrap px-4 py-3">Bill Id</th>
                  <th className="whitespace-nowrap px-4 py-3">Branch Name</th>
                  <th className="whitespace-nowrap px-4 py-3">Type</th>
                  <th className="whitespace-nowrap px-4 py-3">Service</th>
                  <th className="whitespace-nowrap px-4 py-3">Ref Month Used</th>
                  <th className="whitespace-nowrap px-4 py-3">Bill Month</th>
                  <th className="whitespace-nowrap px-4 py-3">Doc No</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
                  <th className="whitespace-nowrap px-4 py-3">Plan Keys</th>
                  <th className="whitespace-nowrap px-4 py-3">Why Not Matched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row, idx) => (
                  <tr
                    key={String(row.id)}
                    className={`transition hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{String(row.id)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{row.branch_name ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          row.projectType === 'WARRANTY'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-sky-50 text-sky-700 ring-sky-200'
                        }`}
                      >
                        {row.projectType}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.resolvedJobs.map(j => (
                          <span
                            key={j}
                            className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200"
                          >
                            {j}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                      {row.refMonthRaw || '-'}
                      {row.schedule_month_ref?.trim() ? (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">ref</span>
                      ) : (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">month</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{row.month ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{row.doc_no ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-slate-700">
                      {row.total != null ? Number(row.total).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.keys.map(kk => (
                          <span
                            key={kk.key}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs ring-1 ring-inset ${
                              kk.matched
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : 'bg-rose-50 text-rose-700 ring-rose-200'
                            }`}
                          >
                            <span className={kk.matched ? 'text-emerald-500' : 'text-rose-500'}>
                              {kk.matched ? '✓' : '✗'}
                            </span>
                            {kk.key}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${REASON_META[row.reason].cls}`}
                      >
                        {REASON_META[row.reason].label}
                      </span>
                      {row.reason !== 'MATCHED' && row.hintMonths.length > 0 && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          contract months: {row.hintMonths.join(', ')}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-sm text-slate-500">
                      {loading
                        ? 'Loading...'
                        : `No ${mode === 'unmatched' ? 'unmatched ' : ''}bills for Plan Year ${planYear}.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">How this page decides &quot;not matched&quot;</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Plan side: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">contract_branch</code> + <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">isWorkInMonth()</code>, service parsed from <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">description</code></li>
            <li>Bill side: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">schedule_month_ref</code> when non-empty, otherwise <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">month</code> (empty string must fall through, not <code>??</code>)</li>
            <li>Key format: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">branch | service | yyyy-MM</code> — one mismatch means the bill never shows Done in Dashboard</li>
            <li>Only bills whose ref month falls inside the selected Plan Year are listed; other years are excluded</li>
            <li>WARRANTY bills need both <code>schedule_month_ref</code> and <code>service_type</code>, and are hidden unless the checkbox is on</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
