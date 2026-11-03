'use client'
import { useState, useMemo, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

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

type Props = {
  rawBranchData: ContractBranchRow[]
  rawBillsData: MaintenanceBillRow[]
  isBoss: boolean
  updateBillServiceType: (billId: bigint, serviceType: string | null) => Promise<void>
  children?: ReactNode
}

const jobPriority: Record<string, number> = { GWM: 1, KPM: 2, KPS: 3, GTC: 4 }

// ✅ 新增：拆分 & 分隔的多服务类型
function splitServiceTypes(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split('&').map(s => s.trim()).filter(Boolean)
}

// ✅ 修改：返回 string | null，不再返回 undefined，修复TS2322报错
function getBillJobType(descRaw: string | null, total: number | null): string | null {
  if (!descRaw) return null
  const d = descRaw.trim().toUpperCase()
  if (d.includes('KITCHEN PIPELINE MANAGEMENT')) return 'KPM'
  if (d.includes('GREASE WASTE')) return 'GWM'

  if (d.includes('PLUMBING')) {
    // >=1500 判定为 KPM，否则 KPS
    if (total && total >= 1500) {
      return 'KPM'
    } else {
      return 'KPS'
    }
  }
  if (d.includes('KITCHEN PIPELINE SERVICE')) return 'KPS'
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

// 解析函数：返回数组，支持 & 分隔多个月份，标记是否多月份
function parseBillMonth(monthStr: string | null): ParseResult {
  if (!monthStr) return { list: [], isMultiMonth: false, originalText: '' }
  const results: ParsedMonthItem[] = []
  const parts = monthStr.split('&').map(s => s.trim()).filter(Boolean)
  const isMultiMonth = parts.length > 1
  for (const s of parts) {
    // 格式1： 01/01/2026  dd/mm/yyyy
    const dateSlashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (dateSlashMatch) {
      const day = parseInt(dateSlashMatch[1],10)
      const m = parseInt(dateSlashMatch[2],10)
      const y = parseInt(dateSlashMatch[3],10)
      if (m >=1 && m <=12 && y >=2020) {
        results.push({year:y, month:m})
        continue
      }
    }
    // 格式2： 2026-01 iso
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10)
      const m = parseInt(isoMatch[2], 10)
      if (m >= 1 && m <= 12 && y >= 2020) {
        results.push({ year: y, month: m })
        continue
      }
    }
    // 格式3： Jan-26
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

type BillInfo = {
  billYM: number
  refYM: number
  billDate: string | null
  total: number | null
  docNo: string | null
  isMultiMonth: boolean
  refRawText: string
  serviceTypes: string[] // 存拆分后的数组
}

export default function DashboardStateWrapper({ rawBranchData, rawBillsData, isBoss, updateBillServiceType, children }: Props) {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [activeMonth, setActiveMonth] = useState(1)
  const [searchText, setSearchText] = useState('')
  const [customerFilter, setCustomerFilter] = useState<'all' | 'CBTL' | "Nando's">('all')
  // ✅ 新增服务筛选
  const [serviceFilter, setServiceFilter] = useState<'all' | 'GWM' | 'KPM' | 'KPS' | 'GTC'>('all')

  // 侧边抽屉开关
  const [sideOpen, setSideOpen] = useState(false)

  const handleRefresh = () => {
    window.location.reload()
  }
  const handleExportExcel = () => {
    alert('Export Excel function')
  }

  // ✅ Late + MultiMonth：原底色 + 黄色文字 + 红色边框
const jobBadgeClass = (job: string, isDone: boolean, isLate: boolean, isMultiMonth: boolean) => {
  let base = ''
  switch (job) {
    case 'GWM': base = 'bg-sky-100 text-sky-700'; break
    case 'KPS': base = 'bg-emerald-100 text-emerald-700'; break
    case 'KPM': base = 'bg-violet-100 text-violet-700'; break
    case 'GTC': base = 'bg-amber-100 text-amber-700'; break
    default: base = 'bg-gray-100 text-gray-600'
  }

  const classes = [base]
  if (isMultiMonth) {
    classes.push('!text-amber-500 font-semibold')
  }
  if (isLate) {
    classes.push('ring-2 ring-red-500')
  }
  return classes.join(' ')
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

  const combinedList = useMemo(() => {
    const billLookup = new Map<string, BillInfo>()
    rawBillsData.forEach((bill) => {
      if (!bill.branch_name) return
      const bName = bill.branch_name.trim()
      if (!bill.project) return
      const projectTrim = bill.project.trim()
      if (!projectTrim.includes('CONTRACT')) return

      // ✅ 优先读取 bill 自带 service_type，支持 "GWM & KPM"
      let rawJobStr = bill.service_type
      if (!rawJobStr) {
        rawJobStr = getBillJobType(bill.description, bill.total)
      }
      if (!rawJobStr) return
      const jobList = splitServiceTypes(rawJobStr)
      if(jobList.length === 0) return

      // 优先 schedule_month_ref， fallback bill.month
      const refYMString = bill.schedule_month_ref ?? bill.month
      const refParseRes = parseBillMonth(refYMString)
      const refYMList = refParseRes.list
      if (refYMList.length === 0) return
      const billParseRes = parseBillMonth(bill.month)
      const billYMList = billParseRes.list
      if (billYMList.length === 0) return
      const billYM = billYMList[0].year * 12 + billYMList[0].month

      for (const refYMObj of refYMList) {
        const refYM = refYMObj.year * 12 + refYMObj.month
        const refYMKey = `${refYMObj.year}-${String(refYMObj.month).padStart(2, '0')}`
        // 同一个bill多个job，循环写入lookup
        for(const job of jobList) {
          const key = `${bName}|${job}|${refYMKey}`
          if (!billLookup.has(key)) {
            billLookup.set(key, {
              billYM,
              refYM,
              billDate: bill.bill_date,
              total: bill.total,
              docNo: bill.doc_no,
              isMultiMonth: refParseRes.isMultiMonth,
              refRawText: refParseRes.originalText,
              serviceTypes: jobList
            })
          }
        }
      }
    })

    const scheduleMap = new Map<string, {
      branch_name: string
      company_name: string
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
      if (!ok || !row.contract_no) return
      const parts = row.contract_no.split('-')
      const type = parts.length > 1 ? parts[1].trim() : ''
      if (!['GWM', 'KPS', 'KPM', 'GTC'].includes(type)) return

      if (!scheduleMap.has(bName)) {
        scheduleMap.set(bName, {
          branch_name: bName,
          company_name: row.company_name ?? '',
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
      billMap: Record<string, BillInfo>
    }> = []
    scheduleMap.forEach((v) => {
      const doneJobs: string[] = []
      const lateJobs: string[] = []
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
        billMap
      })
    })

    let list = result
    // 搜索文字筛选
    if (searchText) {
      const kw = searchText.toLowerCase()
      list = list.filter(
        (b) =>
          b.branch_name.toLowerCase().includes(kw) ||
          b.company_name.toLowerCase().includes(kw)
      )
    }
    // 客户筛选
    if (customerFilter !== 'all') {
      list = list.filter((b) => {
        const fullName = (b.company_name ?? '').toLowerCase()
        if (customerFilter === 'CBTL') return fullName.includes('coffee bean')
        if (customerFilter === "Nando's") return fullName.includes("nando's")
        return true
      })
    }
    // ✅ 新增 Service Type 筛选
    if (serviceFilter !== 'all') {
      list = list.filter(b => {
        return b.planJobs.includes(serviceFilter) || b.doneJobs.includes(serviceFilter)
      })
    }
    return list.filter((i) => i.planJobs.length > 0)
  }, [rawBranchData, rawBillsData, year, activeMonth, searchText, customerFilter, serviceFilter])

  return (
    <div className="w-full relative">
      {/* 左侧滑出抽屉 - 带动画 */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-xl z-50 p-4 flex flex-col gap-3 pt-20 transition-transform duration-300 ease-in-out ${
          sideOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <p className="text-base font-semibold text-gray-600 mb-4 uppercase tracking-wider">
          Reports
        </p>
        <a
          href="/annual-table"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setSideOpen(false)}
          className="block bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors shadow-sm text-center"
        >
          Annual Maintenance Schedule
        </a>
        <a
          href="/customer-excel"
          onClick={() => setSideOpen(false)}
          className="block mt-1 bg-emerald-600 text-white px-3 py-2 rounded text-sm hover:bg-emerald-700 transition-colors shadow-sm text-center"
        >
          Customer Schedule Report
        </a>
        {/* ===== 新增 Boss 专属 Data Validation Checker ===== */}
        {isBoss && (
          <a
            href="/data-checker"
            onClick={() => setSideOpen(false)}
            className="block mt-1 bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 transition-colors shadow-sm text-center"
          >
            Data Validation Checker
          </a>
        )}

        <button
          onClick={() => setSideOpen(false)}
          className="mt-auto text-slate-500 underline text-sm"
        >
          Close
        </button>
      </div>

      {/* 遮罩 带动画淡入淡出 */}
      <div
        onClick={() => setSideOpen(false)}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ease-in-out ${
          sideOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ========== 【单行筛选栏，强制不换行】 ========== */}
      <div className="flex flex-nowrap items-center gap-1 mb-4 p-2 bg-white border border-gray-200 rounded-md shadow-sm overflow-x-auto">
        {/* ✅ 汉堡按钮放到 Monthly Schedule 左边 */}
        <button
          onClick={() => setSideOpen(!sideOpen)}
          className="p-1 rounded hover:bg-gray-100 transition-colors text-slate-700 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap shrink-0">
          Monthly Schedule
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Customer:</span>
          <button
            type="button"
            onClick={() => setCustomerFilter('all')}
            className={`px-2 py-0.5 rounded text-sm font-semibold transition-colors ${
              customerFilter === 'all'
                ? 'bg-red-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setCustomerFilter('CBTL')}
            className={`px-2 py-0.5 rounded text-sm font-semibold transition-colors ${
              customerFilter === 'CBTL'
                ? 'bg-red-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            CBTL
          </button>
          <button
            type="button"
            onClick={() => setCustomerFilter("Nando's")}
            className={`px-2 py-0.5 rounded text-sm font-semibold transition-colors ${
              customerFilter === "Nando's"
                ? 'bg-red-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Nando's
          </button>
        </div>

        {/* ✅ Service Type 筛选下拉 */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Service:</span>
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

        <div className="flex gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setActiveMonth(m)}
              className={`w-7 h-7 text-xs border rounded transition-colors ${
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
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm min-w-24 max-w-32 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          >
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
            <option value={2028}>2028</option>
          </select>

          <button
            type="button"
            onClick={handleRefresh}
            className="bg-white border border-gray-300 text-gray-700 px-2 py-0.5 rounded text-sm hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="bg-blue-600 text-white px-2 py-0.5 rounded text-sm hover:bg-blue-700 transition-colors shadow-sm"
          >
            ↓ Export Excel
          </button>
          {children}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-auto min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="border border-slate-600 px-3 py-2 text-left font-medium w-14">No.</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium w-[220px]">Branch Name</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium">Plan (Schedule)</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium">Done</th>
                <th className="border border-slate-600 px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {combinedList.length === 0 ? (
                <tr>
                  <td className="border border-gray-200 px-3 py-6 text-center text-gray-400" colSpan={5}>
                    No CONTRACT job for this month
                  </td>
                </tr>
              ) : (
                combinedList.map((item, idx) => {
                  const allDone = item.planJobs.every((j) => item.doneJobs.includes(j))
                  const someDone = item.planJobs.some((j) => item.doneJobs.includes(j))
                  const hasLate = item.lateJobs.length > 0
                  return (
                    <tr
                      key={item.branch_name}
                      className={`transition-colors ${
                        idx % 2 === 0 ? 'bg-white hover:bg-emerald-50' : 'bg-gray-50 hover:bg-emerald-50'
                      }`}
                    >
                      <td className="border border-gray-200 px-3 py-2 text-gray-500">{idx + 1}</td>
                      <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">
                        {item.branch_name}
                      </td>
                      <td className="border border-gray-200 px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {item.planJobs.map((job) => (
                            <span
                              key={job}
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${jobBadgeClass(job, false, false, false)}`}
                            >
                              {job}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="border border-gray-200 px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {item.doneJobs.length === 0 ? (
                            <span className="text-gray-400">-</span>
                          ) : (
                            item.doneJobs.map((job) => {
                              const info = item.billMap[job]
                              return (
                                <span
                                  key={job}
                                  className={`relative inline-block px-2.5 py-1 rounded-full text-xs font-semibold cursor-help group ${jobBadgeClass(job, true, item.lateJobs.includes(job), info.isMultiMonth)}`}
                                >
                                  {job}
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                                    <div>Doc No: {info?.docNo ?? '-'}</div>
                                    <div>Date: {info?.billDate ?? '-'}</div>
                                    <div>Amount: {info?.total ?? '-'}</div>
                                    <div className="text-amber-300">Services: {info?.serviceTypes.join(' & ') ?? '-'}</div>
                                    {info?.isMultiMonth && <div className="text-amber-300">Ref Month: {info.refRawText}</div>}
                                  </span>
                                </span>
                              )
                            })
                          )}
                        </div>
                      </td>
                      <td className="border border-gray-200 px-3 py-2">
                        {allDone ? (
                          hasLate ? (
                            <span className="relative text-orange-600 font-semibold cursor-help group">
                              ✅ Done (Late)
                              <span className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                                {item.doneJobs.map((j) => {
                                  const info = item.billMap[j]
                                  return (
                                    <div key={j}>
                                      <div>Doc No: {info?.docNo ?? '-'}</div>
                                      <div>Date: {info?.billDate ?? '-'}</div>
                                      <div>Amount: {info?.total ?? '-'}</div>
                                      <div className="text-amber-300">Services: {info?.serviceTypes.join(' & ') ?? '-'}</div>
                                      {info?.isMultiMonth && <div className="text-amber-300">Ref Month: {info.refRawText}</div>}
                                    </div>
                                  )
                                })}
                              </span>
                            </span>
                          ) : (
                            <span className="relative text-green-600 font-semibold cursor-help group">
                              ✅ On Time
                              <span className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                                {item.doneJobs.map((j) => {
                                  const info = item.billMap[j]
                                  return (
                                    <div key={j}>
                                      <div>Doc No: {info?.docNo ?? '-'}</div>
                                      <div>Date: {info?.billDate ?? '-'}</div>
                                      <div>Amount: {info?.total ?? '-'}</div>
                                      <div className="text-amber-300">Services: {info?.serviceTypes.join(' & ') ?? '-'}</div>
                                      {info?.isMultiMonth && <div className="text-amber-300">Ref Month: {info.refRawText}</div>}
                                    </div>
                                  )
                                })}
                              </span>
                            </span>
                          )
                        ) : someDone ? (
                          <span className="relative text-orange-600 font-semibold cursor-help group">
                            ⏳ Partial Done
                            <span className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col bg-gray-800 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50">
                              {item.doneJobs.map((j) => {
                                const info = item.billMap[j]
                                return (
                                  <div key={j}>
                                    <div>Doc No: {info?.docNo ?? '-'}</div>
                                    <div>Date: {info?.billDate ?? '-'}</div>
                                    <div>Amount: {info?.total ?? '-'}</div>
                                    <div className="text-amber-300">Services: {info?.serviceTypes.join(' & ') ?? '-'}</div>
                                    {info?.isMultiMonth && <div className="text-amber-300">Ref Month: {info.refRawText}</div>}
                                  </div>
                                )
                              })}
                            </span>
                          </span>
                        ) : (
                          <span className="text-red-500 font-semibold">❌ Not Start</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
