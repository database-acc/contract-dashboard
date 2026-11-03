'use client'
import { useState, useMemo } from 'react'
import ExcelJS from 'exceljs'

type ContractBranchRow = {
  id: bigint
  contract_no: string | null
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
  year: number | null
}
type MaintenanceBillRow = {
  id: bigint
  area_code: string | null
  month: string | null
  schedule_month_ref: string | null
  doc_no: string | null
  bill_date: string | null
  description: string | null
  service_type: string | null
  total: number | null
  branch_name: string | null
}

const monthList = [
  { num: 1, label: 'Jan' },
  { num: 2, label: 'Feb' },
  { num: 3, label: 'Mar' },
  { num: 4, label: 'Apr' },
  { num: 5, label: 'May' },
  { num: 6, label: 'Jun' },
  { num: 7, label: 'Jul' },
  { num: 8, label: 'Aug' },
  { num: 9, label: 'Sep' },
  { num: 10, label: 'Oct' },
  { num: 11, label: 'Nov' },
  { num: 12, label: 'Dec' },
]

const getServiceClass = (type: string) => {
  switch (type) {
    case 'GWM':
      return 'bg-sky-100 border-2 border-sky-400 text-sky-800'
    case 'KPS':
      return 'bg-emerald-100 border-2 border-emerald-400 text-emerald-800'
    case 'KPM':
      return 'bg-purple-100 border-2 border-purple-400 text-purple-800'
    case 'GTC':
      return 'bg-amber-100 border-2 border-amber-400 text-amber-800'
    default:
      return 'bg-gray-100 border-2 border-gray-400'
  }
}
const multiMonthClass = 'bg-red-100 border-2 border-red-500 text-red-800'

// Excel颜色映射 ARGB（去掉#）
const excelColorMap: Record<string, string> = {
  GWM: 'BFE4FF',
  KPS: 'B9F2C9',
  KPM: 'E8D8FB',
  GTC: 'FFE8A3',
  MULTI: 'FECDD3',
  CBTL_ROW: 'F5F3FF',
  NANDO_ROW: 'FFF7ED',
  HEADER: '334155',
}

// 根据branch_name获取行背景色：CBTL浅紫，Nando浅橘
const getRowBgClass = (branchName: string | null): string => {
  if (!branchName) return ''
  const upper = branchName.toUpperCase()
  if (upper.includes('CBTL')) return 'bg-violet-50'
  if (upper.includes('NANDO')) return 'bg-orange-50'
  return ''
}

type BillLookupItem = {
  serviceType: string
  doc_no: string | null
  bill_date: string | null
  total: number | null
  isLate: boolean
  refMonths: number[]
  isMultiMonth: boolean
}

type Props = {
  contractData: ContractBranchRow[]
  billData: MaintenanceBillRow[]
  initYear: number
}

export default function AnnualTableWrapper({ contractData, billData, initYear }: Props) {
  const [year, setYear] = useState(String(initYear))
  const [customerFilter, setCustomerFilter] = useState<'ALL' | 'CBTL' | 'NANDO'>('ALL')
  const [serviceFilter, setServiceFilter] = useState('ALL')
  const [searchKey, setSearchKey] = useState('')
  const targetYearNum = Number(year)

  const billLookup = useMemo(() => {
    if (targetYearNum !== initYear) {
      return new Map<string, BillLookupItem>()
    }
    const map = new Map<string, BillLookupItem>()
    billData.forEach((bill) => {
      if (!bill.branch_name || !bill.month) return
      const [mStr, ySuffix] = bill.month.split('-')
      if (ySuffix !== year.slice(-2)) return

      const mIndex = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(mStr)
      if (mIndex === -1) return
      const billMonth = mIndex + 1

      const refMonths = parseRefMonths(bill.schedule_month_ref)
      const st = bill.service_type ?? getBillJobType(bill.description)
      if (!st) return

      const bn = bill.branch_name.trim()
      refMonths.forEach((refM) => {
        const key = `${bn}|${refM}`
        map.set(key, {
          serviceType: st,
          doc_no: bill.doc_no,
          bill_date: bill.bill_date,
          total: bill.total,
          isLate: billMonth > refM,
          refMonths,
          isMultiMonth: refMonths.length > 1,
        })
      })
    })
    return map
  }, [billData, year, targetYearNum, initYear])

  const groupedBranches = useMemo(() => {
    console.log('[Wrapper] total contractData from server:', contractData.length)
    const groupMap = new Map<string, Record<number, Set<string>>>()

    contractData.forEach((row) => {
      if (!row.branch_name) return
      if(row.year !== null && row.year !== targetYearNum) return

      const st = getBillJobType(row.description)
      if (!st) return
      const monthStr = row.month_of_year
      if (!monthStr) return

      const monthNums = monthStr
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n) && n >= 1 && n <= 12)

      const branchName = row.branch_name.trim()
      if (!groupMap.has(branchName)) {
        groupMap.set(branchName, {})
      }
      const monthMap = groupMap.get(branchName)!

      monthNums.forEach((m) => {
        if (!monthMap[m]) monthMap[m] = new Set()
        monthMap[m].add(st)
      })
    })

    const out: { branchName: string; monthServices: Record<number, string[]> }[] = []
    groupMap.forEach((monthObj, branchName) => {
      const monthServices: Record<number, string[]> = {}
      Object.entries(monthObj).forEach(([m, set]) => {
        monthServices[Number(m)] = Array.from(set)
      })
      out.push({ branchName, monthServices })
    })
    console.log('[Wrapper] groupedBranches after year filter:', out.length)
    return out
  }, [contractData, targetYearNum])

  const filteredRows = useMemo(() => {
    let list = [...groupedBranches]
    if (customerFilter !== 'ALL') {
      const kw = customerFilter === 'CBTL' ? 'CBTL' : "Nando's"
      list = list.filter((g) => g.branchName.toUpperCase().includes(kw.toUpperCase()))
    }
    if (searchKey.trim()) {
      const sk = searchKey.toLowerCase()
      list = list.filter((g) => g.branchName.toLowerCase().includes(sk))
    }
    if (serviceFilter !== 'ALL') {
      list = list.filter((g) => Object.values(g.monthServices).some((arr) => arr.includes(serviceFilter)))
    }
    const sorted = list.sort((a, b) => a.branchName.localeCompare(b.branchName))
    console.log('[Wrapper] final filteredRows count:', sorted.length)
    return sorted
  }, [groupedBranches, customerFilter, searchKey, serviceFilter])

  function parseRefMonths(raw: string | null): number[] {
    if (!raw) return []
    return raw.split(',').map(Number).filter((n) => !isNaN(n) && n >= 1 && n <= 12)
  }

  function getBillJobType(desc: string | null): string | null {
    if (!desc) return null
    const d = desc.trim().toUpperCase()
    if (d === 'GREASE WASTE MANAGEMENT') return 'GWM'
    if (d === 'KITCHEN PIPELINE SERVICE') return 'KPS'
    if (d === 'PLUMBING WORKS' || d === 'PLUMBING WORK') return 'KPS'
    if (d === 'KITCHEN PIPELINE MANAGEMENT') return 'KPM'
    if(d === 'GREASE TRAP CLEARANCE') return 'GTC'
    return null
  }

  // ✅ 新版Excel导出，样式和网页一致
  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Annual Schedule')
    const headers = ['No.', 'Branch Name', ...monthList.map(m => m.label)]
    ws.addRow(headers)

    // 表头样式
    const headerRow = ws.getRow(1)
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColorMap.HEADER } }
      cell.font = { color: { argb: 'FFFFFF' }, bold: true }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    // 列宽
    ws.getColumn(1).width = 6
    ws.getColumn(2).width = 34
    for(let i=3; i<=14; i++) ws.getColumn(i).width = 13

    const serviceOrder: Record<string, number> = { GWM:1, KPM:2, KPS:3, GTC:4 }

    filteredRows.forEach((g, rowIdx) => {
      const excelRow = ws.addRow([rowIdx + 1, g.branchName])
      // 判断行底色
      const isCbtl = g.branchName.toUpperCase().includes('CBTL')
      const isNando = g.branchName.toUpperCase().includes('NANDO')
      let rowBg = ''
      if(isCbtl) rowBg = excelColorMap.CBTL_ROW
      if(isNando) rowBg = excelColorMap.NANDO_ROW

      // 填充每一个月份单元格
      monthList.forEach((m, colOffset) => {
        const colIndex = 3 + colOffset
        const cell = excelRow.getCell(colIndex)
        const lookupKey = `${g.branchName}|${m.num}`
        const billInfo = billLookup.get(lookupKey)
        const serviceList = g.monthServices[m.num] ?? []

        if(billInfo){
          const text = `${billInfo.serviceType}${billInfo.isLate ? ' (Late)' : ''}`
          cell.value = text
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: billInfo.isMultiMonth ? excelColorMap.MULTI : excelColorMap[billInfo.serviceType] }
          }
        } else if(serviceList.length > 0) {
          const sorted = [...serviceList].sort((a,b)=> (serviceOrder[a]??99) - (serviceOrder[b]??99))
          cell.value = sorted.join(' ')
          // 多个服务优先取第一个颜色
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: excelColorMap[sorted[0]] }
          }
        } else {
          cell.value = ''
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if(rowBg){
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Annual_Schedule_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <h2 className="text-lg font-bold mr-3">Annual Maintenance Schedule</h2>
        <span>Customer:</span>
        <button
          onClick={() => setCustomerFilter('ALL')}
          className={`px-2 rounded ${customerFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-gray-200'}`}
        >
          All
        </button>
        <button
          onClick={() => setCustomerFilter('CBTL')}
          className={`px-2 rounded ${customerFilter === 'CBTL' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
        >
          CBTL
        </button>
        <button
          onClick={() => setCustomerFilter('NANDO')}
          className={`px-2 rounded ${customerFilter === 'NANDO' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
        >
          Nando's
        </button>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="border p-1 rounded"
        >
          <option value="ALL">All Service</option>
          <option value="KPS">KPS</option>
          <option value="KPM">KPM</option>
          <option value="GWM">GWM</option>
          <option value="GTC">GTC</option>
        </select>

        <input
          value={searchKey}
          onChange={(e) => setSearchKey(e.target.value)}
          placeholder="Search branch / customer"
          className="border p-1 rounded"
        />

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="border p-1 rounded"
        >
          <option value="2026">2026</option>
          <option value="2027">2027</option>
        </select>

        <button onClick={handleExportExcel} className="px-3 py-1 bg-blue-600 text-white rounded">
          Export Excel
        </button>
      </div>

      <div className="overflow-auto max-h-[78vh]">
        <table className="border-separate border-spacing-0 w-full min-w-[2400px] text-sm">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th
                className="border-r border-b border-slate-600 p-2 w-14"
                style={{ position: 'sticky', left: 0, top: 0, zIndex: 40, backgroundColor: '#334155' }}
              >
                No.
              </th>
              <th
                className="border-r border-b border-slate-600 p-2 w-[220px]"
                style={{ position: 'sticky', left: 56, top: 0, zIndex: 40, backgroundColor: '#334155' }}
              >
                Branch Name
              </th>
              {monthList.map((m) => (
                <th
                  key={m.num}
                  className="border-r border-b border-slate-600 p-2 min-w-[150px] text-center"
                  style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#334155' }}
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="border-r border-b border-gray-200 p-4 text-center text-gray-500">
                  No contract data found for selected year / filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((g, idx) => {
                const rowBg = getRowBgClass(g.branchName)
                return (
                  <tr key={`${g.branchName}-${idx}`} className={`${rowBg} ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td
                      className="border-r border-b border-gray-200 p-2 w-14"
                      style={{ position: 'sticky', left: 0, zIndex: 20, backgroundColor: 'inherit' }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      className="border-r border-b border-gray-200 p-2 whitespace-nowrap w-[220px]"
                      style={{ position: 'sticky', left: 56, zIndex: 20, backgroundColor: 'inherit' }}
                    >
                      {g.branchName}
                    </td>
                    {monthList.map((m) => {
                      const serviceList = g.monthServices[m.num] ?? []
                      const lookupKey = `${g.branchName}|${m.num}`
                      const billInfo = billLookup.get(lookupKey)

                      if (billInfo) {
                        const cssClass = billInfo.isMultiMonth ? multiMonthClass : getServiceClass(billInfo.serviceType)
                        return (
                          <td key={m.num} className="border-r border-b border-gray-200 p-1 min-w-[150px] text-center relative group">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cssClass}`}>
                              {billInfo.serviceType}
                              {billInfo.isLate ? ' (Late)' : ''}
                            </span>
                            <div className="absolute hidden group-hover:block z-[999] bg-white shadow-lg border p-2 text-left w-52 rounded -top-16 right-0">
                              <div>Doc No: {billInfo.doc_no || '-'}</div>
                              <div>Bill Date: {billInfo.bill_date || '-'}</div>
                              <div>Amount: {billInfo.total ?? '-'}</div>
                              <div>Schedule Month: {billInfo.refMonths.map((x) => monthList[x - 1].label).join(', ')}</div>
                              <div className="text-red-600 font-semibold">
                                {billInfo.isLate ? 'Status: Done (Late)' : 'Status: Done'}
                              </div>
                              {billInfo.isMultiMonth && <div className="text-rose-500 text-xs mt-1">Warning: Multi‑month invoice</div>}
                            </div>
                          </td>
                        )
                      } else if (serviceList.length > 0) {
                        const serviceOrder: Record<string, number> = {
                          GWM:1, KPM:2, KPS:3, GTC:4
                        }
                        const sortedServices = [...serviceList].sort((a,b)=> (serviceOrder[a]??99) - (serviceOrder[b]??99))
                        return (
                          <td key={m.num} className="border-r border-b border-gray-200 p-1 min-w-[150px] text-center">
                            <div className="flex flex-row flex-wrap gap-1 justify-center items-center">
                              {sortedServices.map((s)=>(
                                <span key={s} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getServiceClass(s)}`}>
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                        )
                      } else {
                        return <td key={m.num} className="border-r border-b border-gray-200 p-1 min-w-[150px]"></td>
                      }
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
