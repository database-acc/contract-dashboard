'use client'
import { useState, useMemo, ReactNode, useEffect, useCallback, useRef } from 'react'
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
  description: string | null
  agent: string | null
  area: string | null
  project: string | null
  total: number | null
  branch_name: string | null
  service_type: string | null
}

// ========== 【重构】安排表类型：不再用doc_no，改用 branch + year + month + plan ==========
type BillScheduleAssignRow = {
  id: bigint
  branch_name: string
  schedule_year: number
  schedule_month: number
  plan: string
  schedule_date: string | null
  editor_name: string
  editor_role: string
  edited_at: string
}

type Props = {
  rawBranchData: ContractBranchRow[]
  rawBillsData: MaintenanceBillRow[]
  isBoss: boolean
  updateBillServiceType: (billId: bigint, serviceType: string | null) => Promise<void>
  currentEditorName: string
  currentEditorRole: 'boss' | 'staff'
  children?: ReactNode
}

const jobPriority: Record<string, number> = { GWM: 1, KPM: 2, KPS: 3, GTC: 4 }

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

// ✅ 格式化 Ref Month 01/01/2026 → Jan 2026
function formatRefMonth(text: string | null | undefined): string {
  if (!text) return ""
  const parts = text.split("&").map(p => p.trim())
  const formatted = parts.map(part => {
    const dateSlashMatch = part.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (dateSlashMatch) {
      const [, dd, mm, yyyy] = dateSlashMatch
      const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
      return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    }
    return part
  })
  return formatted.join(" & ")
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
    const dateSlashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (dateSlashMatch) {
      const m = parseInt(dateSlashMatch[2], 10)
      const y = parseInt(dateSlashMatch[3], 10)
      if (m >= 1 && m <= 12 && y >= 2020) {
        results.push({ year: y, month: m })
      }
      continue
    }
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10)
      const m = parseInt(isoMatch[2], 10)
      if (m >= 1 && m <= 12 && y >= 2020) {
        results.push({ year: y, month: m })
      }
      continue
    }
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

type BillInfo = {
  billYM: number
  refYM: number
  billDate: string | null
  total: number | null
  docNo: string | null
  isMultiMonth: boolean
  refRawText: string
  serviceTypes: string[]
  projectType: string
}

export default function DashboardStateWrapper({
  rawBranchData,
  rawBillsData,
  isBoss,
  updateBillServiceType,
  currentEditorName,
  currentEditorRole,
  children
}: Props) {
  const [year, setYear] = useState(2026)
  const [activeMonth, setActiveMonth] = useState(1)
  const [searchText, setSearchText] = useState('')
  const [customerFilter, setCustomerFilter] = useState<'all' | 'CBTL' | "Nando's">('all')
  const [serviceFilter, setServiceFilter] = useState<'all' | 'GWM' | 'KPM' | 'KPS' | 'GTC'>('all')

  const [sideOpen, setSideOpen] = useState(false)

  // ========== Schedule Assign 状态 ==========
  const [scheduleAssignList, setScheduleAssignList] = useState<BillScheduleAssignRow[]>([])
  // 编辑key：branch|plan
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [tempScheduleDate, setTempScheduleDate] = useState<string>("")
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const editingCellRef = useRef<HTMLTableCellElement | null>(null)

  const loadScheduleAssign = useCallback(async () => {
    const { data, error } = await supabase
      .from("bill_schedule_assign")
      .select("*")
    if (!error && data) {
      setScheduleAssignList(data as BillScheduleAssignRow[])
    }
  }, [])

  useEffect(() => {
    loadScheduleAssign()
  }, [loadScheduleAssign])

  // 查找排程：branch + year + month + plan
  const getAssignInfo = (branchName: string, plan: string, targetYear: number, targetMonth: number) => {
    return scheduleAssignList.find(
      s => s.branch_name === branchName && s.schedule_year === targetYear && s.schedule_month === targetMonth && s.plan === plan
    )
  }

  // 保存安排日期（upsert，主键：branch_name, schedule_year, schedule_month, plan）
  const handleSaveScheduleDate = async (branchName: string, plan: string, dateVal: string) => {
    const saveKey = `${branchName}|${plan}`
    setSavingKey(saveKey)
    const dbDateStr = dateVal || null
    try {
      const { error } = await supabase
        .from("bill_schedule_assign")
        .upsert({
          branch_name: branchName,
          schedule_year: year,
          schedule_month: activeMonth,
          plan: plan,
          schedule_date: dbDateStr,
          editor_name: currentEditorName,
          editor_role: currentEditorRole,
          edited_at: new Date().toISOString()
        }, { onConflict: "branch_name,schedule_year,schedule_month,plan" })

      if (error) throw error

      setScheduleAssignList(prev => {
        const existIndex = prev.findIndex(
          x => x.branch_name === branchName && x.schedule_year === year && x.schedule_month === activeMonth && x.plan === plan
        )
        const newItem: BillScheduleAssignRow = {
          branch_name: branchName,
          schedule_year: year,
          schedule_month: activeMonth,
          plan: plan,
          schedule_date: dbDateStr,
          editor_name: currentEditorName,
          editor_role: currentEditorRole,
          edited_at: new Date().toISOString(),
          id: existIndex >= 0 ? prev[existIndex].id : 0n
        }
        if (existIndex >= 0) {
          const arr = [...prev]
          arr[existIndex] = newItem
          return arr
        } else {
          return [...prev, newItem]
        }
      })
    } catch (err) {
      console.error("保存安排日期失败", err)
      alert("保存失败，请重试")
    } finally {
      setSavingKey(null)
      setEditingKey(null)
      editingCellRef.current = null
    }
  }

  // ✅ 用 mousedown 判断点击外部；点在当前编辑单元格内不关闭
  useEffect(() => {
    const handleMouseDownOutside = (e: MouseEvent) => {
      if (!editingCellRef.current) return
      if (!editingCellRef.current.contains(e.target as Node)) {
        setEditingKey(null)
        editingCellRef.current = null
      }
    }
    document.addEventListener("mousedown", handleMouseDownOutside)
    return () => document.removeEventListener("mousedown", handleMouseDownOutside)
  }, [])

  const handleRefresh = () => {
    window.location.reload()
  }
  const handleExportExcel = () => {
    alert('Export Excel function')
  }

  const jobBadgeClass = (job: string, isDone: boolean, isLate: boolean, isMultiMonth: boolean, isWarranty: boolean) => {
    let base = ''
    switch (job) {
      case 'GWM': base = 'bg-sky-100 text-sky-700'; break
      case 'KPS': base = 'bg-emerald-100 text-emerald-700'; break
      case 'KPM': base = 'bg-violet-100 text-violet-700'; break
      case 'GTC': base = 'bg-amber-100 text-amber-700'; break
      default: base = 'bg-gray-100 text-gray-700'
    }
    const arr = [base, 'rounded-full px-3 py-1 inline-block']
    if (isMultiMonth) arr.push('!text-amber-500 font-semibold')
    if (isLate) arr.push('ring-2 ring-red-400')
    if (isWarranty) arr.push('border-2 border-dashed border-red-500')
    return arr.join(' ')
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
    if (freq === 'quarterly') return [1,4,7,10].includes(targetMonth)
    if (freq === 'half_year') return [1,7].includes(targetMonth)
    return false
  }

  const combinedList = useMemo(() => {
    const billLookup = new Map<string, BillInfo>()
    rawBillsData.forEach((bill) => {
      if (!bill.branch_name) return
      const bName = bill.branch_name.trim()
      if (!bill.project) return
      const projectTrim = bill.project.trim()

      const isContract = projectTrim.includes('CONTRACT')
      const isWarranty = projectTrim.includes('WARRANTY')

      if (!isContract && !isWarranty) return

      if (isWarranty) {
        if (!bill.schedule_month_ref || !bill.service_type) {
          return
        }
      }

      let rawJobStr = bill.service_type
      if (!rawJobStr) {
        rawJobStr = getBillJobType(bill.description, bill.total)
      }
      if (!rawJobStr) return
      const jobList = splitServiceTypes(rawJobStr)
      if (jobList.length === 0) return

      const refYMString = (bill.schedule_month_ref?.trim() || bill.month)
      const refParseRes = parseBillMonth(refYMString)
      const refYMList = refParseRes.list
      if (refYMList.length === 0) return

      const billParseRes = parseBillMonth(bill.month)
      const billYMList = billParseRes.list
      if (billYMList.length === 0) return
      const billYM = billYMList[0].year * 12 + billYMList[0].month

      for (const refYMObj of refYMList) {
        const refYMKey = `${refYMObj.year}-${String(refYMObj.month).padStart(2, '0')}`
        for (const job of jobList) {
          const key = `${bName}|${job}|${refYMKey}`
          if (!billLookup.has(key)) {
            billLookup.set(key, {
              billYM,
              refYM: refYMObj.year * 12 + refYMObj.month,
              billDate: bill.bill_date,
              total: bill.total,
              docNo: bill.doc_no,
              isMultiMonth: refParseRes.isMultiMonth,
              refRawText: refParseRes.originalText,
              serviceTypes: jobList,
              projectType: isContract ? 'CONTRACT' : 'WARRANTY'
            })
          }
        }
      }
    })

    const scheduleMap = new Map<string, {
      branch_name: string
      company_name: string
      description: string | null
      planJobs: Array<{ job: string; planYMKey: string; planYM: number }>
    }>()
    const currentPlanYMKey = `${year}-${String(activeMonth).padStart(2, '0')}`
    const currentPlanYM = year * 12 + activeMonth

    rawBranchData.forEach((row) => {
      if (!row.branch_name) return
      const bName = row.branch_name.trim()
      const ok = isWorkInMonth(
        row.frequency,
        year,
        activeMonth,
        row.start_date,
        row.end_date,
        row.status,
        row.month_of_year
      )
      if (!ok || !row.description) return

      const desc = row.description.trim().toUpperCase()
      let type: string | null = null
      if (desc.includes('GREASE WASTE MANAGEMENT')) type = 'GWM'
      else if (desc.includes('KITCHEN PIPELINE MANAGEMENT')) type = 'KPM'
      else if (desc.includes('KITCHEN PIPELINE SERVICE')) type = 'KPS'
      else if (desc.includes('GREASE TRAP CLEARANCE')) type = 'GTC'
      if (!type) return

      if (!scheduleMap.has(bName)) {
        scheduleMap.set(bName, {
          branch_name: bName,
          company_name: row.company_name ?? '',
          description: row.description,
          planJobs: []
        })
      }
      const item = scheduleMap.get(bName)!
      const exist = item.planJobs.some(p => p.job === type)
      if (!exist) {
        item.planJobs.push({
          job: type,
          planYMKey: currentPlanYMKey,
          planYM: currentPlanYM
        })
      }
    })

    const result: Array<{
      branch_name: string
      company_name: string
      planJobs: string[]
      doneJobs: string[]
      lateJobs: string[]
      earlyJobs: string[]
      billMap: Record<string, BillInfo>
    }> = []
    scheduleMap.forEach((v) => {
      const doneJobs: string[] = []
      const lateJobs: string[] = []
      const earlyJobs: string[] = []
      const billMap: Record<string, BillInfo> = {}
      v.planJobs.forEach(p => {
        const lookupKey = `${v.branch_name}|${p.job}|${p.planYMKey}`
        const billInfo = billLookup.get(lookupKey)
        if (billInfo) {
          doneJobs.push(p.job)
          billMap[p.job] = billInfo
          if (billInfo.billYM > p.planYM) {
            lateJobs.push(p.job)
          }
          if (billInfo.billYM < p.planYM) {
            earlyJobs.push(p.job)
          }
        }
      })
      const planJobStr = v.planJobs.map(x => x.job).sort((a, b) => (jobPriority[a] ?? 99) - (jobPriority[b] ?? 99))
      const doneJobStr = [...new Set(doneJobs)].sort((a, b) => (jobPriority[a] ?? 99) - (jobPriority[b] ?? 99))
      result.push({
        branch_name: v.branch_name,
        company_name: v.company_name,
        planJobs: planJobStr,
        doneJobs: doneJobStr,
        lateJobs,
        earlyJobs,
        billMap
      })
    })

    let list = result
    if (searchText) {
      const kw = searchText.toLowerCase()
      list = list.filter(
        (b) =>
          b.branch_name.toLowerCase().includes(kw) ||
          b.company_name.toLowerCase().includes(kw)
      )
    }
    if (customerFilter !== 'all') {
      list = list.filter((b) => {
        const fullName = (b.company_name ?? '').toLowerCase()
        if (customerFilter === 'CBTL') return fullName.includes('coffee bean')
        if (customerFilter === "Nando's") return fullName.includes("nando's")
        return true
      })
    }
    if (serviceFilter !== 'all') {
      list = list.filter(b => {
        return b.planJobs.includes(serviceFilter) || b.doneJobs.includes(serviceFilter)
      })
    }
    return list.filter((i) => i.planJobs.length > 0)
  }, [rawBranchData, rawBillsData, year, activeMonth, searchText, customerFilter, serviceFilter])

  return (
    <div className="w-full relative">
      {/* Side Drawer */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-xl z-50 flex flex-col gap-3 pt-20 transition-transform duration-300 ease-in-out ${
          sideOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <p className="text-base font-semibold text-gray-600 mb-4 uppercase tracking-wider px-4">
          Reports
        </p>
        <a
          href="/annual-table"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setSideOpen(false)}
          className="block bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colours text-center mx-4"
        >
          Annual Maintenance Schedule
        </a>
        <a
          href="/customer-excel"
          onClick={() => setSideOpen(false)}
          className="block mt-1 bg-emerald-600 text-white px-3 py-2 rounded text-sm hover:bg-emerald-700 transition-colours text-center mx-4"
        >
          Customer Schedule Report
        </a>
        {isBoss && (
          <>
            <a
              href="/data-checker"
              onClick={() => setSideOpen(false)}
              className="block mt-1 bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 transition-colours text-center mx-4"
            >
              Data Validation Checker
            </a>
            <a
              href="/bill-contract-mismatch"
              onClick={() => setSideOpen(false)}
              className="block mt-1 bg-orange-600 text-white px-3 py-2 rounded text-sm hover:bg-orange-700 transition-colours text-center mx-4"
            >
              Bill-Contract Mismatch Check
            </a>
            <a
              href="/bill-diff"
              onClick={() => setSideOpen(false)}
              className="block mt-1 bg-amber-700 text-white px-3 py-2 rounded text-sm hover:bg-amber-800 transition-colours text-center mx-4"
            >
              Bill Diff Checker
            </a>
          </>
        )}

        {/* ✅ 新增员工手机日历页面链接，所有人可见，不需要isBoss权限 */}
        <a
          href="/staff-schedule"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setSideOpen(false)}
          className="block mt-1 bg-sky-500 text-white px-3 py-2 rounded text-sm hover:bg-sky-600 transition-colours text-center mx-4"
        >
          Staff Mobile Schedule
        </a>

        <button
          onClick={() => setSideOpen(false)}
          className="mt-auto text-slate-500 underline text-sm px-4 py-2"
        >
          Close
        </button>
      </div>
      {sideOpen && (
        <div
          onClick={() => setSideOpen(false)}
          className="fixed inset-0 bg-black/30 z-40"
        />
      )}

      {/* Filter Bar 【重点修复：flex-wrap，空间不足自动换行，不再重叠】 */}
      <div className="flex flex-wrap items-center gap-1 mb-4 p-2 bg-white border border-gray-200 rounded-md shadow-sm">
        <button
          onClick={() => setSideOpen(!sideOpen)}
          className="p-1 rounded hover:bg-gray-100 transition-colours text-slate-700 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="text-sm font-semibold text-gray-700 shrink-0">Monthly Schedule</span>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-medium text-gray-700">Customer:</span>
          <button
            type="button"
            onClick={() => setCustomerFilter('all')}
            className={`px-2 py-0.5 rounded text-sm font-semibold transition-colours ${
              customerFilter === 'all' ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setCustomerFilter('CBTL')}
            className={`px-2 py-0.5 rounded text-sm font-semibold transition-colours ${
              customerFilter === 'CBTL' ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            CBTL
          </button>
          <button
            type="button"
            onClick={() => setCustomerFilter("Nando's")}
            className={`px-2 py-0.5 rounded text-sm font-semibold transition-colours ${
              customerFilter === "Nando's" ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Nando's
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-medium text-gray-700">Service:</span>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value as any)}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm bg-white"
          >
            <option value="all">All Service</option>
            <option value="GWM">GWM</option>
            <option value="KPM">KPM</option>
            <option value="KPS">KPS</option>
            <option value="GTC">GTC</option>
          </select>
        </div>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded px-1.5 py-0.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500 shrink-0"
        >
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
          <option value={2028}>2028</option>
        </select>

        <div className="flex gap-0.5 shrink-0">
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setActiveMonth(m)}
              className={`w-7 h-7 text-xs border rounded transition-colours ${
                activeMonth === m
                  ? 'bg-red-700 text-white border-red-700 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search branch / customer"
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm min-w-24 max-w-32 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            type="button"
            onClick={handleRefresh}
            className="bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded text-sm hover:bg-gray-50 transition-colours"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="bg-blue-600 text-white px-2 py-0.5 rounded text-sm hover:bg-blue-700 transition-colours shadow-sm"
          >
            ↓ Export Excel
          </button>
          {children}
        </div>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-auto min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-black">
                <th className="border border-slate-600 px-3 py-2 text-left font-medium w-14">No.</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium w-[220px]">Branch Name</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium w-[160px] whitespace-nowrap">Plan (Schedule)</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium">Schedule Date</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium">Done / Status</th>
              </tr>
            </thead>
            <tbody>
              {combinedList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-gray-200 px-3 py-6 text-center text-gray-400">
                    No CONTRACT / WARRANTY job for this month
                  </td>
                </tr>
              ) : (
                combinedList.map((item, idx) => {
                  const allDone = item.planJobs.every(j => item.doneJobs.includes(j))
                  const someDone = item.planJobs.some(j => item.doneJobs.includes(j))
                  const hasLate = item.lateJobs.length > 0
                  const isFirstRow = idx === 0
                  const tooltipClass = isFirstRow
                    ? "absolute top-full left-1/2 -translate-x-1/2 mt-1 hidden group-hover:flex flex-col"
                    : "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col"

                  return (
                    <tr
                      key={item.branch_name}
                      className={`transition-colours ${
                        idx % 2 === 0 ? 'bg-white hover:bg-emerald-50' : 'bg-gray-50 hover:bg-emerald-50'
                      }`}
                    >
                      <td className="border border-gray-200 px-3 py-2 text-gray-500">{idx + 1}</td>
                      {/* ✅ Branch Name：强制黑色 + 加粗 */}
                      <td className="border border-gray-200 px-3 py-2 font-bold text-black">
                        {item.branch_name}
                      </td>
                      <td className="border border-gray-200 px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {item.planJobs.map(job => (
                            <span
                              key={job}
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${jobBadgeClass(job, false, false, false, false)}`}
                            >
                              {job}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* ✅ Schedule Date：现在【每一个plan单独编辑】，不再依赖docNo！ */}
                      <td
                        ref={editingCellRef}
                        className="border border-gray-200 px-3 py-2 whitespace-nowrap relative"
                      >
                        <div className="flex flex-wrap gap-2">
                          {item.planJobs.map(job => {
                            const editKey = `${item.branch_name}|${job}`
                            const assignInfo = getAssignInfo(item.branch_name, job, year, activeMonth)
                            const isEditingThis = editingKey === editKey
                            return (
                              <div key={job} className="flex items-center gap-1">
                                {isEditingThis ? (
                                  <div
                                    className="flex gap-1 items-center"
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="date"
                                      value={tempScheduleDate}
                                      onChange={(e) => setTempScheduleDate(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="border border-gray-300 rounded px-1 py-0.5 text-sm bg-white text-black"
                                    />
                                    <button
                                      onClick={() => handleSaveScheduleDate(item.branch_name, job, tempScheduleDate)}
                                      disabled={savingKey === editKey}
                                      className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-60"
                                    >
                                      {savingKey === editKey ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingKey(null)
                                        editingCellRef.current = null
                                      }}
                                      className="px-2 py-0.5 bg-gray-200 rounded text-xs hover:bg-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    onClick={() => {
                                      setEditingKey(editKey)
                                      setTempScheduleDate(assignInfo?.schedule_date ?? "")
                                    }}
                                    className="cursor-pointer text-blue-700 hover:underline text-xs"
                                  >
                                    {job}: {assignInfo?.schedule_date ?? "-"}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </td>

                      {/* Done / Status 列 ———— 修改后：badge与状态同一行 */}
                      <td className="border border-gray-200 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.doneJobs.length === 0 ? (
                            <span className="text-gray-400">-</span>
                          ) : (
                            item.doneJobs.map(job => {
                              const info = item.billMap[job]
                              const isLate = item.lateJobs.includes(job)
                              const isEarly = item.earlyJobs.includes(job)
                              const isWarranty = info?.projectType === 'WARRANTY'

                              const earlyRingStyle: React.CSSProperties = isEarly
                                ? { boxShadow: '0 0 0 2px #facc15' }
                                : {}

                              return (
                                <span
                                  key={job}
                                  className={`relative inline-block px-2.5 py-1 rounded-full text-xs font-semibold cursor-help group ${jobBadgeClass(job, true, isLate, info.isMultiMonth, isWarranty)}`}
                                  style={earlyRingStyle}
                                >
                                  {job}
                                  <span className={`${tooltipClass} bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50`}>
                                    <div>Doc No: {info?.docNo ?? '-'}</div>
                                    <div>Date: {info?.billDate ?? '-'}</div>
                                    <div>Amount: {info?.total ?? '-'}</div>
                                    <div className="text-amber-300">Services: {info?.serviceTypes.join(' & ') ?? '-'}</div>
                                    {info?.isMultiMonth && <div className="text-amber-300">Ref Month: {formatRefMonth(info.refRawText)}</div>}
                                    {isWarranty && (
                                      <div className="text-red-400 font-bold mt-0.5">WARRANTY</div>
                                    )}
                                  </span>
                                </span>
                              )
                            })
                          )}

                          {allDone ? (
                            hasLate ? (
                              <span className="relative text-orange-600 font-semibold cursor-help group text-xs">
                                ✅ Done (Late)
                                <span className={`${tooltipClass} bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50`}>
                                  {item.doneJobs.map((j) => {
                                    const info = item.billMap[j]
                                    return (
                                      <div key={j}>{j} | Doc:{info?.docNo ?? '-'}</div>
                                    )
                                  })}
                                </span>
                              </span>
                            ) : (
                              <span className="relative text-green-600 font-semibold cursor-help group text-xs">
                                ✅ On Time
                                <span className={`${tooltipClass} bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50`}>
                                  {item.doneJobs.map((j) => {
                                    const info = item.billMap[j]
                                    return (
                                      <div key={j}>{j} | Doc:{info?.docNo ?? '-'}</div>
                                    )
                                  })}
                                </span>
                              </span>
                            )
                          ) : someDone ? (
                            <span className="relative text-orange-600 font-semibold cursor-help group text-xs">
                              ⏳ Partial Done
                              <span className={`${tooltipClass} bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50`}>
                                {item.doneJobs.map((j) => {
                                  const info = item.billMap[j]
                                  return (
                                    <div key={j}>{j} | Doc:{info?.docNo ?? '-'}</div>
                                  )
                                })}
                              </span>
                            </span>
                          ) : (
                            <span className="text-red-500 font-semibold text-xs">❌ Not Start</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {/* 图例 */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700">
          <div className="font-semibold mb-2">Legend Notes:</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
            <div className="flex items-center gap-2">
              <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 border-2 border-dashed border-red-500"></span>
              <span>Red dashed border = WARRANTY</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 ring-2 ring-red-400"></span>
              <span>Solid red ring = Done (Late)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 ring-2 ring-yellow-400"></span>
              <span>Yellow solid ring = Done Early</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 !text-amber-500 font-semibold text-xs">KPS</span>
              <span>Yellow text = Multiple jobs / months in one Bill</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
