'use client'
import React, { useState, useMemo } from 'react'
import { Workbook } from 'exceljs'
import { useRouter } from 'next/navigation'

type ContractBranchRow = {
  id: bigint
  contract_no: string | null
  branch_name: string | null
  company_name: string | null
  frequency: string | null
  description: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  month_of_year: string | null
  times_per_year: string | null
  schedule_rule: string | null
  state: string | null
  jan_price: number | null
  jan_midnight: number | null
  jan_outstation: number | null
  feb_price: number | null
  feb_midnight: number | null
  feb_outstation: number | null
  mar_price: number | null
  mar_midnight: number | null
  mar_outstation: number | null
  apr_price: number | null
  apr_midnight: number | null
  apr_outstation: number | null
  may_price: number | null
  may_midnight: number | null
  may_outstation: number | null
  jun_price: number | null
  jun_midnight: number | null
  jun_outstation: number | null
  jul_price: number | null
  jul_midnight: number | null
  jul_outstation: number | null
  aug_price: number | null
  aug_midnight: number | null
  aug_outstation: number | null
  sep_price: number | null
  sep_midnight: number | null
  sep_outstation: number | null
  oct_price: number | null
  oct_midnight: number | null
  oct_outstation: number | null
  nov_price: number | null
  nov_midnight: number | null
  nov_outstation: number | null
  dec_price: number | null
  dec_midnight: number | null
  dec_outstation: number | null
}

type Props = {
  rawData: ContractBranchRow[]
}

const monthList = [
  { key: 'jan', label: 'Jan' },
  { key: 'feb', label: 'Feb' },
  { key: 'mar', label: 'Mar' },
  { key: 'apr', label: 'Apr' },
  { key: 'may', label: 'May' },
  { key: 'jun', label: 'Jun' },
  { key: 'jul', label: 'Jul' },
  { key: 'aug', label: 'Aug' },
  { key: 'sep', label: 'Sep' },
  { key: 'oct', label: 'Oct' },
  { key: 'nov', label: 'Nov' },
  { key: 'dec', label: 'Dec' },
]

const serviceOptions = [
  { value: 'all', label: 'All Service' },
  { value: 'GWM', label: 'GWM' },
  { value: 'KPM', label: 'KPM' },
  { value: 'KPS', label: 'KPS' },
  { value: 'GTC', label: 'GTC' },
]

function getServiceType(contractNo: string | null): 'KPS' | 'KPM' | 'GWM' | 'GTC' | null {
  if (!contractNo) return null
  if (contractNo.includes('KPS')) return 'KPS'
  if (contractNo.includes('KPM')) return 'KPM'
  if (contractNo.includes('GWM')) return 'GWM'
  if (contractNo.includes('GTC')) return 'GTC'
  return null
}

function formatNum(n: number): string {
  return n.toLocaleString('en-MY')
}

type OutletMonthData = {
  jobLabels: Set<string>
  totalPrice: number
  kps: number
  kpm: number
  gwm: number
  gtc: number
  midnight: number
  outstation: number
}

type AggregatedRow = {
  group: string
  branch_name: string | null
  monthData: Record<string, OutletMonthData>
}

export default function CustomerExcelTable({ rawData }: Props) {
  const router = useRouter()
  const [year, setYear] = useState<number>(2026)
  const [viewMode, setViewMode] = useState<'full' | 'simple'>('full')
  // Customer 按钮单选
  const [selectedCustomer, setSelectedCustomer] = useState<string>("All")
  // Service 下拉筛选
  const [selectedService, setSelectedService] = useState<string>("all")

  // 客户列表固定 All / CBTL / Nando's，和截图一致
  const customerList = ["All", "CBTL", "Nando's"]

  // 1. 年份过滤
  const yearFilteredData = useMemo(() => {
    return rawData.filter((row) => {
      if (!row.start_date || !row.end_date) return false
      const s = new Date(row.start_date)
      const e = new Date(row.end_date)
      return s.getFullYear() <= year && e.getFullYear() >= year
    })
  }, [rawData, year])

  // 2. 客户 + Service 双重筛选
  const filteredData = useMemo(() => {
    let list = yearFilteredData
    // 客户筛选
    if (selectedCustomer !== "All") {
      list = list.filter(item => item.branch_name?.startsWith(selectedCustomer))
    }
    // Service 筛选
    if (selectedService !== "all") {
      list = list.filter(r => {
        const st = getServiceType(r.contract_no)
        return st === selectedService
      })
    }
    return list
  }, [yearFilteredData, selectedCustomer, selectedService])

  // ========== 聚合Outlet，FullView / SimpleView 共用同一套聚合数据 ==========
  const groupedRows: AggregatedRow[] = useMemo(() => {
    const map = new Map<string, AggregatedRow>()

    for (const r of filteredData) {
      const rawState = r.state?.trim()
      const group = rawState && rawState !== '' ? rawState : 'KL'
      const outlet = r.branch_name
      const serviceType = getServiceType(r.contract_no)
      if (!serviceType) continue

      const key = `${group}||${outlet ?? ''}`
      if (!map.has(key)) {
        map.set(key, {
          group,
          branch_name: outlet,
          monthData: {}
        })
      }
      const item = map.get(key)!

      for (const m of monthList) {
        const price = (r[`${m.key}_price` as keyof ContractBranchRow] as number | null) ?? 0
        const midnight = (r[`${m.key}_midnight` as keyof ContractBranchRow] as number | null) ?? 0
        const outstation = (r[`${m.key}_outstation` as keyof ContractBranchRow] as number | null) ?? 0
        const monthTotal = price + midnight + outstation

        if (!item.monthData[m.key]) {
          item.monthData[m.key] = {
            jobLabels: new Set(),
            totalPrice: 0,
            kps: 0,
            kpm: 0,
            gwm: 0,
            gtc: 0,
            midnight: 0,
            outstation: 0,
          }
        }
        const md = item.monthData[m.key]
        md.jobLabels.add(serviceType)
        md.totalPrice += monthTotal
        md.midnight += midnight
        md.outstation += outstation
        if (serviceType === 'KPS') md.kps += price
        if (serviceType === 'KPM') md.kpm += price
        if (serviceType === 'GWM') md.gwm += price
        if (serviceType === 'GTC') md.gtc += price
      }
    }

    const arr = Array.from(map.values())
    // State A-Z，Outlet A-Z 排序
    return arr.sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group)
      return (a.branch_name ?? '').localeCompare(b.branch_name ?? '')
    })
  }, [filteredData])

  // 导出
  const handleExport = async () => {
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet(`${year}_Schedule`)

    // 统一Excel色值，和网页 bg-sky-50 / bg-sky-200 对应
    const styleHeader = {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'F1F5F9' } },
      font: { bold: true },
      alignment: { vertical: 'middle' as const, horizontal: 'center' as const },
      border: { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }
    }
    const styleGroup = {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'E2E8F0' } },
      font: { bold: true },
      alignment: { vertical: 'middle' as const, horizontal: 'left' as const },
      border: { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }
    }
    const styleData = {
      alignment: { vertical: 'middle' as const, horizontal: 'center' as const },
      border: { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }
    }
    // Subtotal 统一色值（和网页 bg-sky-50 一致）
    const styleSubtotalCell = {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'F0F9FF' } },
      font: { bold: true },
      alignment: { vertical: 'middle' as const, horizontal: 'right' as const },
      border: { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }
    }
    // Grand Total 汇总行（和网页 bg-sky-200 一致）
    const styleTotalRow = {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'BAE6FD' } },
      font: { bold: true },
      alignment: { vertical: 'middle' as const, horizontal: 'right' as const },
      border: { top: { style: 'medium' as const }, bottom: { style: 'medium' as const }, left: { style: 'thin' as const }, right: { style: 'thin' as const } }
    }
    const styleThickRight = {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF' } },
      font: {},
      alignment: { vertical: 'middle' as const, horizontal: 'center' as const },
      border: { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'medium' as const } }
    }
    const styleThickRightSub = {
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'F0F9FF' } },
      font: { bold: true },
      alignment: { vertical: 'middle' as const, horizontal: 'right' as const },
      border: { top: { style: 'thin' as const }, bottom: { style: 'thin' as const }, left: { style: 'thin' as const }, right: { style: 'medium' as const } }
    }

    if (viewMode === 'simple') {
      sheet.columns = [
        { width: 6 },
        { width: 32 },
        ...Array(monthList.length * 2).fill({ width: 12 }),
        { width: 14 } // Overall Total 新增列宽
      ]
      const monthRowCells: (string | number)[] = ["NO", "Outlet"]
      monthList.forEach(m => monthRowCells.push(m.label, ""))
      monthRowCells.push("Overall Total")
      const monthRow = sheet.addRow(monthRowCells)
      monthList.forEach((_, idx) => {
        const startCol = 3 + idx * 2
        sheet.mergeCells(monthRow.number, startCol, monthRow.number, startCol + 1)
        monthRow.getCell(startCol).style = styleThickRight
      })
      // Overall Total header
      monthRow.getCell(3 + monthList.length * 2).style = styleSubtotalCell
      monthRow.getCell(1).style = styleHeader
      monthRow.getCell(2).style = styleHeader

      const headerCells: (string | number)[] = ["NO", "Outlet"]
      monthList.forEach(() => headerCells.push("Job", "Subtotal"))
      headerCells.push("")
      const headerRow = sheet.addRow(headerCells)
      headerRow.eachCell((cell, colIdx) => {
        if (colIdx > 2 && (colIdx - 2) % 2 === 0) {
          cell.style = styleThickRightSub
        } else {
          cell.style = styleThickRight
        }
      })
      // 单独设置 Overall Total 表头单元格
      headerRow.getCell(3 + monthList.length * 2).style = styleSubtotalCell

      let no = 1
      let currentGroup = ''
      groupedRows.forEach(r => {
        if (r.group !== currentGroup) {
          currentGroup = r.group
          const gRowCells: (string | number)[] = [currentGroup, ""]
          monthList.forEach(() => {
            gRowCells.push("", "")
          })
          gRowCells.push("")
          const gRow = sheet.addRow(gRowCells)
          gRow.getCell(1).style = styleGroup
          gRow.getCell(2).style = styleGroup
          for (let ci = 3; ci <= gRow.cellCount - 1; ci++) {
            const isSub = (ci - 2) % 2 === 0
            if (isSub) {
              gRow.getCell(ci).style = styleThickRightSub
            } else {
              gRow.getCell(ci).style = styleThickRight
            }
          }
          gRow.getCell(gRow.cellCount).style = styleSubtotalCell
        }
        // 计算该Outlet全年合计
        const outletYearTotal = monthList.reduce((sum, m) => {
          return sum + (r.monthData[m.key]?.totalPrice ?? 0)
        }, 0)
        const rowCells: (string | number)[] = [no++, r.branch_name ?? "-"]
        monthList.forEach(m => {
          const md = r.monthData[m.key]
          const jobText = md ? Array.from(md.jobLabels).join(' / ') : ''
          const sub = md?.totalPrice ?? 0
          rowCells.push(jobText, sub > 0 ? sub : "")
        })
        rowCells.push(outletYearTotal > 0 ? outletYearTotal : "")
        const dataRow = sheet.addRow(rowCells)
        dataRow.eachCell((cell, colNo) => {
          if (colNo <= 2) {
            cell.style = styleData
            return
          }
          // 最后一列 Overall Total
          if (colNo === dataRow.cellCount) {
            cell.style = styleSubtotalCell
            return
          }
          const isSub = (colNo - 2) % 2 === 0
          if (isSub) {
            cell.style = styleThickRightSub
          } else {
            cell.style = styleThickRight
          }
        })
      })
      // Overall Total 底部汇总行
      const grandTotal = groupedRows.reduce((sum, r) => {
        return sum + monthList.reduce((s, m) => s + (r.monthData[m.key]?.totalPrice ?? 0), 0)
      }, 0)
      const totalCells: (string | number)[] = ["OVERALL TOTAL", ""]
      monthList.forEach((_, mi) => {
        let sum = 0
        groupedRows.forEach(r => {
          const md = r.monthData[monthList[mi].key]
          sum += md?.totalPrice ?? 0
        })
        totalCells.push("", sum > 0 ? sum : "")
      })
      totalCells.push(grandTotal > 0 ? grandTotal : "")
      const totalRow = sheet.addRow(totalCells)
      sheet.mergeCells(totalRow.number, 1, totalRow.number, 2)
      totalRow.eachCell((cell, colNo) => {
        if (colNo <= 2) {
          cell.style = styleTotalRow
          return
        }
        if (colNo === totalRow.cellCount) {
          cell.style = styleTotalRow
          return
        }
        cell.style = { ...styleTotalRow, border: { ...styleTotalRow.border, right: { style: 'medium' as const } } }
      })
    } else {
      // Full View Excel，增加 Overall Total 一列
      const colCount = 2 + monthList.length * 7 + 1
      sheet.columns = [
        { width: 6 },
        { width: 30 },
        ...Array(monthList.length * 7).fill({ width: 10 }),
        { width: 14 }
      ]
      const monthRowCells: (string | number)[] = ["NO", "Outlet"]
      monthList.forEach(m => monthRowCells.push(m.label, "", "", "", "", "", ""))
      monthRowCells.push("Overall Total")
      const monthRow = sheet.addRow(monthRowCells)
      monthList.forEach((_, idx) => {
        const startCol = 3 + idx * 7
        sheet.mergeCells(monthRow.number, startCol, monthRow.number, startCol + 6)
        monthRow.getCell(startCol).style = styleHeader
      })
      monthRow.getCell(1).style = styleHeader
      monthRow.getCell(2).style = styleHeader
      monthRow.getCell(monthRow.cellCount).style = styleSubtotalCell

      const headerCells: (string | number)[] = ["NO", "Outlet"]
      monthList.forEach(() => headerCells.push("KPS", "KPM", "GWM", "GTC", "Mid", "Out", "Subtotal"))
      headerCells.push("")
      const headerRow = sheet.addRow(headerCells)
      headerRow.eachCell((cell, colNo) => {
        if ((colNo - 2) % 7 === 0 && colNo > 2) cell.style = styleSubtotalCell
        else cell.style = styleHeader
      })
      headerRow.getCell(headerRow.cellCount).style = styleSubtotalCell

      let no = 1
      let currentGroup = ''
      groupedRows.forEach(r => {
        if (r.group !== currentGroup) {
          currentGroup = r.group
          const gRow = sheet.addRow([currentGroup])
          sheet.mergeCells(gRow.number, 1, gRow.number, colCount)
          gRow.getCell(1).style = styleGroup
        }
        const rowCells: (string | number)[] = [no++, r.branch_name ?? "-"]
        const outletYearTotal = monthList.reduce((sum, m) => sum + (r.monthData[m.key]?.totalPrice ?? 0), 0)
        monthList.forEach(m => {
          const md = r.monthData[m.key]
          const valKPS = md?.kps ?? 0
          const valKPM = md?.kpm ?? 0
          const valGWM = md?.gwm ?? 0
          const valGTC = md?.gtc ?? 0
          const valMid = md?.midnight ?? 0
          const valOut = md?.outstation ?? 0
          const valSub = md?.totalPrice ?? 0
          rowCells.push(
            valKPS > 0 ? valKPS : '',
            valKPM > 0 ? valKPM : '',
            valGWM > 0 ? valGWM : '',
            valGTC > 0 ? valGTC : '',
            valMid > 0 ? valMid : '',
            valOut > 0 ? valOut : '',
            valSub > 0 ? valSub : ''
          )
        })
        rowCells.push(outletYearTotal > 0 ? outletYearTotal : "")
        const dataRow = sheet.addRow(rowCells)
        dataRow.eachCell((cell, colNo) => {
          if (colNo === dataRow.cellCount) {
            cell.style = styleSubtotalCell
          } else if ((colNo - 2) % 7 === 0 && colNo > 2) cell.style = styleSubtotalCell
          else cell.style = styleData
        })
      })

      const totalCells: (string | number)[] = ["TOTAL", ""]
      let grandTotalSum = 0
      for (let mi = 0; mi < monthList.length; mi++) {
        let sumKPS = 0, sumKPM = 0, sumGWM = 0, sumGTC = 0, sumMid = 0, sumOut = 0, sumSub = 0
        groupedRows.forEach(r => {
          const md = r.monthData[monthList[mi].key]
          sumKPS += md?.kps ?? 0
          sumKPM += md?.kpm ?? 0
          sumGWM += md?.gwm ?? 0
          sumGTC += md?.gtc ?? 0
          sumMid += md?.midnight ?? 0
          sumOut += md?.outstation ?? 0
          sumSub += md?.totalPrice ?? 0
        })
        grandTotalSum += sumSub
        totalCells.push(
          sumKPS > 0 ? sumKPS : '',
          sumKPM > 0 ? sumKPM : '',
          sumGWM > 0 ? sumGWM : '',
          sumGTC > 0 ? sumGTC : '',
          sumMid > 0 ? sumMid : '',
          sumOut > 0 ? sumOut : '',
          sumSub > 0 ? sumSub : ''
        )
      }
      totalCells.push(grandTotalSum > 0 ? grandTotalSum : "")
      const totalRow = sheet.addRow(totalCells)
      sheet.mergeCells(totalRow.number, 1, totalRow.number, 2)
      totalRow.eachCell(c => c.style = styleTotalRow)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const serviceName = selectedService === 'all' ? 'AllService' : selectedService
    a.download = `${year}_${viewMode === 'simple' ? 'Job_Summary' : 'Full_Detailed'}_${selectedCustomer}_${serviceName}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Full View 渲染，现在追加 Overall Total
  const renderFullView = () => {
    const rows: React.ReactNode[] = []
    let no = 1
    let currentGroup = ''
    groupedRows.forEach((r, idx) => {
      if (r.group !== currentGroup) {
        currentGroup = r.group
        rows.push(
          <tr key={`g-${idx}`} className="bg-slate-100">
            <td className="border border-slate-200 p-2 font-semibold" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#e2e8f0' }}>{currentGroup}</td>
            <td className="border border-slate-200 p-2 font-semibold" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#e2e8f0' }}></td>
            <td colSpan={monthList.length * 7 + 1} className="border border-slate-200 p-2"></td>
          </tr>
        )
      }
      const cells: React.ReactNode[] = []
      monthList.forEach(m => {
        const md = r.monthData[m.key]
        const kps = md?.kps ?? 0
        const kpm = md?.kpm ?? 0
        const gwm = md?.gwm ?? 0
        const gtc = md?.gtc ?? 0
        const midnight = md?.midnight ?? 0
        const outstation = md?.outstation ?? 0
        const sub = md?.totalPrice ?? 0
        cells.push(
          <td key={`${m.key}-kps`} className="border border-slate-200 p-2 text-right">{kps > 0 ? formatNum(kps) : ''}</td>,
          <td key={`${m.key}-kpm`} className="border border-slate-200 p-2 text-right">{kpm > 0 ? formatNum(kpm) : ''}</td>,
          <td key={`${m.key}-gwm`} className="border border-slate-200 p-2 text-right">{gwm > 0 ? formatNum(gwm) : ''}</td>,
          <td key={`${m.key}-gtc`} className="border border-slate-200 p-2 text-right">{gtc > 0 ? formatNum(gtc) : ''}</td>,
          <td key={`${m.key}-mid`} className="border border-slate-200 p-2 text-right">{midnight > 0 ? formatNum(midnight) : ''}</td>,
          <td key={`${m.key}-out`} className="border border-slate-200 p-2 text-right">{outstation > 0 ? formatNum(outstation) : ''}</td>,
          <td key={`${m.key}-sub`} className="border border-sky-200 p-2 text-right bg-sky-50 font-bold text-slate-900">{sub > 0 ? formatNum(sub) : ''}</td>,
        )
      })
      // Outlet 全年 Overall Total
      const outletYearTotal = monthList.reduce((sum, m) => sum + (r.monthData[m.key]?.totalPrice ?? 0), 0)
      cells.push(
        <td key={`ov-${idx}`} className="border border-sky-200 p-2 text-right bg-sky-50 font-bold text-slate-900">
          {outletYearTotal > 0 ? formatNum(outletYearTotal) : ''}
        </td>
      )
      rows.push(
        <tr key={`r-${idx}`} className="hover:bg-slate-50">
          <td className="border border-slate-200 p-2" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#fff' }}>{no++}</td>
          <td className="border border-slate-200 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#fff' }}>{r.branch_name ?? '-'}</td>
          {...cells}
        </tr>
      )
    })

    const totalCells: React.ReactNode[] = []
    let grandTotalSum = 0
    monthList.forEach((m, mi) => {
      let sumKPS = 0, sumKPM = 0, sumGWM = 0, sumGTC = 0, sumMid = 0, sumOut = 0, sumSub = 0
      groupedRows.forEach(r => {
        const md = r.monthData[monthList[mi].key]
        sumKPS += md?.kps ?? 0
        sumKPM += md?.kpm ?? 0
        sumGWM += md?.gwm ?? 0
        sumGTC += md?.gtc ?? 0
        sumMid += md?.midnight ?? 0
        sumOut += md?.outstation ?? 0
        sumSub += md?.totalPrice ?? 0
      })
      grandTotalSum += sumSub
      totalCells.push(
        <td key={`t-${m.key}-kps`} className="border border-sky-200 p-2 text-right bg-sky-100 font-bold">{sumKPS > 0 ? formatNum(sumKPS) : ''}</td>,
        <td key={`t-${m.key}-kpm`} className="border border-sky-200 p-2 text-right bg-sky-100 font-bold">{sumKPM > 0 ? formatNum(sumKPM) : ''}</td>,
        <td key={`${m.key}-gwm`} className="border border-sky-200 p-2 text-right bg-sky-100 font-bold">{sumGWM > 0 ? formatNum(sumGWM) : ''}</td>,
        <td key={`t-${m.key}-gtc`} className="border border-sky-200 p-2 text-right bg-sky-100 font-bold">{sumGTC > 0 ? formatNum(sumGTC) : ''}</td>,
        <td key={`t-${m.key}-mid`} className="border border-sky-200 p-2 text-right bg-sky-100 font-bold">{sumMid > 0 ? formatNum(sumMid) : ''}</td>,
        <td key={`t-${m.key}-out`} className="border border-sky-200 p-2 text-right bg-sky-100 font-bold">{sumOut > 0 ? formatNum(sumOut) : ''}</td>,
        <td key={`t-${m.key}-sub`} className="border border-sky-300 border-t-2 border-b-2 p-2 text-right bg-sky-200 font-bold">{sumSub > 0 ? formatNum(sumSub) : ''}</td>,
      )
    })
    // Grand Total 最右侧 Overall Total
    totalCells.push(
      <td key="grand-ov" className="border border-sky-300 border-t-2 border-b-2 p-2 text-right bg-sky-200 font-bold">
        {grandTotalSum > 0 ? formatNum(grandTotalSum) : ''}
      </td>
    )
    rows.push(
      <tr key="total-row" className="bg-sky-200 font-bold">
        <td className="border border-sky-300 border-t-2 border-b-2 p-2" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#bae6fd' }}>TOTAL</td>
        <td className="border border-sky-300 border-t-2 border-b-2 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#bae6fd' }}></td>
        {...totalCells}
      </tr>
    )
    return rows
  }

  // Simple View：合并Outlet、Job用 / 拼接、金额相加 ✅
  const renderSimpleView = () => {
    const rows: React.ReactNode[] = []
    let no = 1
    let currentGroup = ''
    groupedRows.forEach((r, idx) => {
      if (r.group !== currentGroup) {
        currentGroup = r.group
        const groupCells: React.ReactNode[] = []
        monthList.forEach((m) => {
          // ✅ 全部月份统一加上粗右线，不再判断mi
          groupCells.push(
            <td key={`g-${m.key}-job`} className="border border-slate-200 p-2 border-r-2 border-slate-400"></td>,
            <td key={`g-${m.key}-sub`} className="border border-sky-200 p-2 bg-sky-50 font-bold border-r-2 border-slate-400"></td>
          )
        })
        // group 行的 Overall Total，统一 bg-sky-50
        groupCells.push(<td key={`g-overall`} className="border border-sky-200 p-2 bg-sky-50 font-bold"></td>)
        rows.push(
          <tr key={`g-${idx}`} className="bg-slate-100">
            <td className="border border-slate-200 p-2 font-semibold" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#e2e8f0' }}>{currentGroup}</td>
            <td className="border border-slate-200 p-2 font-semibold" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#e2e8f0' }}></td>
            {...groupCells}
          </tr>
        )
      }
      const cells: React.ReactNode[] = []
      monthList.forEach((m) => {
        const md = r.monthData[m.key]
        const jobText = md ? Array.from(md.jobLabels).join(' / ') : ''
        const subTotal = md?.totalPrice ?? 0
        // ✅ 全部月份统一加上粗右线
        cells.push(
          <td key={`${m.key}-job`} className="border border-slate-200 p-2 text-center border-r-2 border-slate-400">{jobText}</td>,
          <td key={`${m.key}-sub`} className="border border-sky-200 p-2 text-right bg-sky-50 font-bold border-r-2 border-slate-400">{subTotal > 0 ? formatNum(subTotal) : ''}</td>
        )
      })
      // 门店 Jan-Dec 全年合计，底色 bg-sky-50 和subtotal完全一致
      const outletYearTotal = monthList.reduce((sum, m) => {
        return sum + (r.monthData[m.key]?.totalPrice ?? 0)
      }, 0)
      cells.push(
        <td key={`overall-${idx}`} className="border border-sky-200 p-2 text-right bg-sky-50 font-bold">
          {outletYearTotal > 0 ? formatNum(outletYearTotal) : ''}
        </td>
      )
      rows.push(
        <tr key={`r-${idx}`} className="hover:bg-slate-50">
          <td className="border border-slate-200 p-2" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#fff' }}>{no++}</td>
          <td className="border border-slate-200 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#fff' }}>{r.branch_name ?? '-'}</td>
          {...cells}
        </tr>
      )
    })

    const totalCells: React.ReactNode[] = []
    let grandTotalSum = 0
    monthList.forEach((m) => {
      let sumSub = 0
      groupedRows.forEach(r => {
        const md = r.monthData[m.key]
        sumSub += md?.totalPrice ?? 0
      })
      grandTotalSum += sumSub
      // ✅ 全部月份统一加上粗右线
      totalCells.push(
        <td key={`t-${m.key}-job`} className="border border-sky-200 p-2 text-center border-r-2 border-slate-400"></td>,
        <td key={`t-${m.key}-sub`} className="border border-sky-300 border-t-2 border-b-2 p-2 text-right bg-sky-200 font-bold border-r-2 border-slate-400">{sumSub > 0 ? formatNum(sumSub) : ''}</td>
      )
    })
    // 底部OVERALL TOTAL行的最右格，和Total行蓝色保持一致 bg-sky-200
    totalCells.push(
      <td key="t-grand" className="border border-sky-300 border-t-2 border-b-2 p-2 text-right bg-sky-200 font-bold">
        {grandTotalSum > 0 ? formatNum(grandTotalSum) : ''}
      </td>
    )
    rows.push(
      <tr key="total-row" className="bg-sky-200 font-bold">
        <td className="border border-sky-300 border-t-2 border-b-2 p-2" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#bae6fd' }}>OVERALL TOTAL</td>
        <td className="border border-sky-300 border-t-2 border-b-2 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#bae6fd' }}></td>
        {...totalCells}
      </tr>
    )
    return rows
  }

  return (
    <div className="p-4">
      {/* 第一行：标题单独一行 */}
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        Customer Schedule Report ({year})
      </h1>

      {/* 第二行：全部控件同一行 */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('full')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'full'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Full Detailed View
          </button>
          <button
            onClick={() => setViewMode('simple')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'simple'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Job Summary View
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Customer 按钮组 */}
          <div className="flex gap-2">
            {customerList.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCustomer(c)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors h-10
                  ${selectedCustomer === c
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {c}
              </button>
            ))}
          </div>

          <span className="text-base">Service:</span>
          {/* Service 下拉框，h-10 和按钮高度对齐 */}
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 text-base min-w-[160px] bg-white h-10"
          >
            {serviceOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-slate-200 px-2 py-2 rounded text-sm bg-white h-10"
          >
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
            <option value={2028}>2028</option>
          </select>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-3 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded text-sm transition h-10"
          >
            Back to Dashboard
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition h-10"
          >
            Download Excel
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[78vh] border border-slate-200 rounded-lg shadow-sm bg-white">
        {viewMode === 'full' ? (
          <table className="border-collapse text-sm" style={{ minWidth: '2400px', width: 'max-content' }}>
            <thead>
              <tr className="bg-slate-200">
                <th rowSpan={2} className="border border-slate-300 p-2" style={{ position: 'sticky', left: 0, top: 0, zIndex: 15, background: '#e2e8f0' }}>NO</th>
                <th rowSpan={2} className="border border-slate-300 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, top: 0, zIndex: 15, background: '#e2e8f0' }}>Outlet</th>
                {monthList.map((m) => (
                  <th key={`month-${m.key}`} colSpan={7} className="border border-slate-300 p-2" style={{ position: 'sticky', top: 0, zIndex: 11, background: '#e2e8f0' }}>{m.label}</th>
                ))}
                <th rowSpan={2} className="border border-sky-300 p-2 font-bold text-sky-900 bg-sky-50" style={{ position: 'sticky', top: 0, zIndex: 11 }}>Overall Total</th>
              </tr>
              <tr className="bg-slate-100">
                {monthList.map((m) => (
                  <React.Fragment key={`sub-${m.key}`}>
                    <th className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>KPS</th>
                    <th className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>KPM</th>
                    <th className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>GWM</th>
                    <th className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>GTC</th>
                    <th className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>Mid</th>
                    <th className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>Out</th>
                    <th className="border border-sky-300 p-2 font-bold text-sky-900 bg-sky-50" style={{ position: 'sticky', top: 36, zIndex: 11 }}>Subtotal</th>
                  </React.Fragment>
                ))}
                <th className="border border-sky-300 p-2 font-bold text-sky-900 bg-sky-50" style={{ position: 'sticky', top: 36, zIndex: 11 }}></th>
              </tr>
            </thead>
            <tbody>{renderFullView()}</tbody>
          </table>
        ) : (
          <table className="border-collapse text-sm" style={{ minWidth: '1750px', width: 'max-content' }}>
            <thead>
              <tr className="bg-slate-200">
                <th rowSpan={2} className="border border-slate-300 p-2" style={{ position: 'sticky', left: 0, top: 0, zIndex: 15, background: '#e2e8f0' }}>NO</th>
                <th rowSpan={2} className="border border-slate-300 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, top: 0, zIndex: 15, background: '#e2e8f0' }}>Outlet</th>
                {monthList.map((m) => (
                  <th key={`month-${m.key}`} colSpan={2} className="border border-slate-300 p-2 border-r-2 border-slate-400" style={{ position: 'sticky', top: 0, zIndex: 11, background: '#e2e8f0' }}>{m.label}</th>
                ))}
                <th rowSpan={2} className="border border-sky-300 p-2 bg-sky-50 font-bold" style={{ position: 'sticky', top: 0, zIndex: 11 }}>Overall Total</th>
              </tr>
              <tr className="bg-slate-100">
                {monthList.map((m) => (
                  <React.Fragment key={`sub-${m.key}`}>
                    <th className="border border-slate-300 p-2 border-r-2 border-slate-400" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>Job</th>
                    <th className="border border-sky-300 p-2 font-bold text-sky-900 bg-sky-50 border-r-2 border-slate-400" style={{ position: 'sticky', top: 36, zIndex: 11 }}>Subtotal</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>{renderSimpleView()}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
