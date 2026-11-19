'use client'
import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import CustomerExcelTableFull from './CustomerExcelTableFull'
import CustomerExcelTableSummary from './CustomerExcelTableSummary'
import CustomerExcelTableOverall from './CustomerExcelTableOverall'
import {
  useAggregateOutletData,
  monthList,
  getServiceType,
  getBrandKey,
  getRegion,
  BRAND_ORDER,
} from './useAggregateOutletData'
import type { ContractBranchRow, OverallRow, BrandKey } from './types'

type ViewMode = 'full' | 'job-summary' | 'price' | 'overall'
type Props = {
  rawData: ContractBranchRow[]
}

const serviceOptions = [
  { value: 'all', label: 'All Service' },
  { value: 'GWM', label: 'GWM' },
  { value: 'KPM', label: 'KPM' },
  { value: 'KPS', label: 'KPS' },
  { value: 'GTC', label: 'GTC' },
]

export default function CustomerExcelTable({ rawData }: Props) {
  const router = useRouter()
  const [year, setYear] = useState<number>(2026)
  const [viewMode, setViewMode] = useState<ViewMode>('full')
  const [selectedCustomer, setSelectedCustomer] = useState<string>("All")
  const [selectedService, setSelectedService] = useState<string>("all")
  const [isDownloading, setIsDownloading] = useState(false)

  // 自动读取客户列表
  const customerList = useMemo(() => {
    const customerSet = new Set<string>()
    customerSet.add("All")
    rawData.forEach(row => {
      if (row.branch_name) {
        const prefix = row.branch_name.split(' ')[0]
        if (prefix) customerSet.add(prefix)
      }
    })
    return Array.from(customerSet)
  }, [rawData])

  const yearFilteredData = useMemo(() => {
    return rawData.filter((row) => {
      if (!row.start_date || !row.end_date) return false
      const s = new Date(row.start_date)
      const e = new Date(row.end_date)
      return s.getFullYear() <= year && e.getFullYear() >= year
    })
  }, [rawData, year])

  const filteredData = useMemo(() => {
    let list = yearFilteredData
    if (selectedCustomer !== "All") {
      list = list.filter(item => item.branch_name?.startsWith(selectedCustomer))
    }
    if (selectedService !== "all") {
      list = list.filter(r => {
        const st = getServiceType(r.contract_no)
        return st === selectedService
      })
    }
    return list
  }, [yearFilteredData, selectedCustomer, selectedService])

  const groupedRows = useAggregateOutletData(filteredData)

  // ========== Overall Amount View 聚合：品牌 × 地区 × 月份 ==========
  const overallRows = useMemo<OverallRow[]>(() => {
    const matrix: Record<BrandKey, { KL: number[]; OUTSTATION: number[] }> = {
      NANDOS: { KL: Array(12).fill(0), OUTSTATION: Array(12).fill(0) },
      CBTL: { KL: Array(12).fill(0), OUTSTATION: Array(12).fill(0) },
      TC: { KL: Array(12).fill(0), OUTSTATION: Array(12).fill(0) },
    }

    filteredData.forEach(row => {
      const brand = getBrandKey(row.branch_name)
      if (!brand) return
      const region = getRegion(row.state ?? '')
      monthList.forEach((m, mi) => {
        const price = row[`${m.key}_price` as keyof ContractBranchRow]
        const midnight = row[`${m.key}_midnight` as keyof ContractBranchRow]
        const outstation = row[`${m.key}_outstation` as keyof ContractBranchRow]
        // ✅ 修复 TS 2365 报错：全部转成 number 再相加
        const p = Number(price ?? 0)
        const mVal = Number(midnight ?? 0)
        const o = Number(outstation ?? 0)
        matrix[brand][region][mi] += p + mVal + o
      })
    })

    const presentBrands = BRAND_ORDER.filter(
      b => matrix[b].KL.some(v => v > 0) || matrix[b].OUTSTATION.some(v => v > 0)
    )

    const rows: OverallRow[] = []
    const malaysiaSum: number[] = Array(12).fill(0)

    presentBrands.forEach(b => {
      const kl = matrix[b].KL
      const os = matrix[b].OUTSTATION
      const my = kl.map((v, i) => v + os[i])
      rows.push({ key: `${b}-KL`, label: `${b} KL`, kind: 'data', months: kl, annual: kl.reduce((s, v) => s + v, 0) })
      rows.push({ key: `${b}-OS`, label: `${b} OUTSTATION`, kind: 'data', months: os, annual: os.reduce((s, v) => s + v, 0) })
      rows.push({ key: `${b}-MY`, label: `${b} MALAYSIA`, kind: 'malaysia', months: my, annual: my.reduce((s, v) => s + v, 0) })
      my.forEach((v, i) => { malaysiaSum[i] += v })
    })

    if (presentBrands.length > 0) {
      rows.push({
        key: 'grand',
        label: `${presentBrands.join(' + ')} MALAYSIA`,
        kind: 'grand',
        months: malaysiaSum,
        annual: malaysiaSum.reduce((s, v) => s + v, 0),
      })
    }
    return rows
  }, [filteredData])

  const handleExport = async () => {
    setIsDownloading(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()

      // ========== 动态sheet名 ==========
      const serviceLabel = selectedService === 'all' ? 'All' : selectedService
      const customerLabel = selectedCustomer === 'All' ? 'All' : selectedCustomer
      const sheetName = `${serviceLabel} ${customerLabel} ${year}`
      const sheet = workbook.addWorksheet(sheetName)
      sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]

      // 修复：as const 解决BorderStyle类型
      const borderAll = {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      }
      const styleHeader = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } } as const,
        font: { bold: true },
        border: borderAll,
        alignment: { horizontal: 'center' as const, vertical: 'middle' as const }
      }
      const styleSubHeader = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } } as const,
        font: { bold: true },
        border: borderAll,
        alignment: { horizontal: 'center' as const, vertical: 'middle' as const }
      }
      const styleGroupRow = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } } as const,
        font: { bold: true },
        border: borderAll,
        alignment: { vertical: 'middle' as const }
      }
      // OUTSTATION 分隔行浅黄色样式
      const styleDividerRow = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C6' } } as const,
        font: { bold: true },
        border: borderAll,
        alignment: { vertical: 'middle' as const }
      }
      const styleSubTotal = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } } as const,
        font: { bold: true },
        border: borderAll,
        alignment: { horizontal: 'right' as const, vertical: 'middle' as const }
      }
      const styleGrandTotal = {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BAE6FD' } } as const,
        font: { bold: true },
        border: borderAll,
        alignment: { horizontal: 'right' as const, vertical: 'middle' as const }
      }
      const styleCellRight = { border: borderAll, alignment: { horizontal: 'right' as const, vertical: 'middle' as const } }
      const styleCellCenter = { border: borderAll, alignment: { horizontal: 'center' as const, vertical: 'middle' as const } }
      const styleCellLeft = { border: borderAll, alignment: { horizontal: 'left' as const, vertical: 'middle' as const } }

      if (viewMode === 'full') {
        const colCount = 2 + monthList.length * 7 + 1
        // 表头第一行
        const headerRow1Data: (string | number)[] = ['NO', 'Outlet']
        for (const m of monthList) headerRow1Data.push(m.label)
        headerRow1Data.push('Overall Total')
        const headerRow1 = sheet.addRow(headerRow1Data)
        sheet.mergeCells(1, 3, 1, 2 + monthList.length * 7)
        sheet.getCell(1, 1).style = styleHeader
        sheet.getCell(1, 2).style = styleHeader
        sheet.getCell(1, 3).style = styleHeader
        sheet.getCell(1, colCount).style = styleHeader

        // 表头第二行
        const headerRow2Data: (string | number)[] = ['', '']
        for (const m of monthList) {
          headerRow2Data.push('KPS', 'KPM', 'GWM', 'GTC', 'Mid', 'Out', 'Subtotal')
        }
        headerRow2Data.push('')
        const headerRow2 = sheet.addRow(headerRow2Data)
        for (let c = 1; c <= colCount; c++) {
          sheet.getCell(2, c).style = styleSubHeader
        }

        let currentGroup = ''
        let no = 1
        for (const r of groupedRows) {
          // OUTSTATION 分隔行
          if (r.isDivider) {
            const divData: (string | number)[] = ['OUTSTATION', '']
            divData.push(...Array(colCount - 2).fill(''))
            const divRow = sheet.addRow(divData)
            sheet.getRow(divRow.number).eachCell(c => c.style = styleDividerRow)
            sheet.mergeCells(divRow.number, 3, divRow.number, colCount)
            continue
          }

          if (r.group !== currentGroup) {
            currentGroup = r.group
            const groupRowData: (string | number)[] = [currentGroup, '']
            const emptyCells = Array(colCount - 2).fill('')
            groupRowData.push(...emptyCells)
            const groupRow = sheet.addRow(groupRowData)
            sheet.getRow(sheet.lastRow!.number).eachCell(c => c.style = styleGroupRow)
            sheet.mergeCells(sheet.lastRow!.number, 3, sheet.lastRow!.number, colCount)
          }
          const rowData: (string | number)[] = [no++, r.branch_name ?? '-']
          for (const m of monthList) {
            const md = r.monthData[m.key]
            const kps = md?.kps ?? 0
            const kpm = md?.kpm ?? 0
            const gwm = md?.gwm ?? 0
            const gtc = md?.gtc ?? 0
            const midnight = md?.midnight ?? 0
            const outstation = md?.outstation ?? 0
            const sub = md?.totalPrice ?? 0
            rowData.push(kps > 0 ? kps : '', kpm > 0 ? kpm : '', gwm > 0 ? gwm : '', gtc > 0 ? gtc : '', midnight > 0 ? midnight : '', outstation > 0 ? outstation : '', sub > 0 ? sub : '')
          }
          const yearTotal = monthList.reduce((sum, m) => sum + (r.monthData[m.key]?.totalPrice ?? 0), 0)
          rowData.push(yearTotal > 0 ? yearTotal : '')
          const dataRow = sheet.addRow(rowData)

          let ci = 1
          sheet.getCell(dataRow.number, ci++).style = styleCellLeft
          sheet.getCell(dataRow.number, ci++).style = styleCellLeft
          for (const m of monthList) {
            sheet.getCell(dataRow.number, ci++).style = styleCellRight
            sheet.getCell(dataRow.number, ci++).style = styleCellRight
            sheet.getCell(dataRow.number, ci++).style = styleCellRight
            sheet.getCell(dataRow.number, ci++).style = styleCellRight
            sheet.getCell(dataRow.number, ci++).style = styleCellRight
            sheet.getCell(dataRow.number, ci++).style = styleCellRight
            sheet.getCell(dataRow.number, ci++).style = styleSubTotal
          }
          sheet.getCell(dataRow.number, ci++).style = styleSubTotal
        }

        // Grand Total
        const totalRowData: (string | number)[] = ['TOTAL', '']
        let grandTotalSum = 0
        for (const m of monthList) {
          let sumKPS = 0, sumKPM = 0, sumGWM = 0, sumGTC = 0, sumMid = 0, sumOut = 0, sumSub = 0
          for (const r of groupedRows) {
            if(r.isDivider) continue
            const md = r.monthData[m.key]
            sumKPS += md?.kps ?? 0
            sumKPM += md?.kpm ?? 0
            sumGWM += md?.gwm ?? 0
            sumGTC += md?.gtc ?? 0
            sumMid += md?.midnight ?? 0
            sumOut += md?.outstation ?? 0
            sumSub += md?.totalPrice ?? 0
          }
          grandTotalSum += sumSub
          totalRowData.push(sumKPS > 0 ? sumKPS : '', sumKPM > 0 ? sumKPM : '', sumGWM > 0 ? sumGWM : '', sumGTC > 0 ? sumGTC : '', sumMid > 0 ? sumMid : '', sumOut > 0 ? sumOut : '', sumSub > 0 ? sumSub : '')
        }
        totalRowData.push(grandTotalSum > 0 ? grandTotalSum : '')
        const grandRow = sheet.addRow(totalRowData)
        sheet.getRow(grandRow.number).eachCell(c => c.style = styleGrandTotal)
      } else if (viewMode === 'job-summary') {
        const colCount = 2 + monthList.length
        const headerRow1Data: (string | number)[] = ['NO', 'Outlet']
        for (const m of monthList) headerRow1Data.push(m.label)
        const headerRow1 = sheet.addRow(headerRow1Data)
        for (let c = 1; c <= colCount; c++) sheet.getCell(1, c).style = styleHeader

        const headerRow2Data: (string | number)[] = ['', '']
        for (const m of monthList) headerRow2Data.push('Job')
        const headerRow2 = sheet.addRow(headerRow2Data)
        for (let c = 1; c <= colCount; c++) sheet.getCell(2, c).style = styleSubHeader

        let currentGroup = ''
        let no = 1
        for (const r of groupedRows) {
          // OUTSTATION 分隔行
          if (r.isDivider) {
            const divData: (string | number)[] = ['OUTSTATION', '']
            divData.push(...Array(colCount - 2).fill(''))
            const divRow = sheet.addRow(divData)
            sheet.getRow(divRow.number).eachCell(c => c.style = styleDividerRow)
            sheet.mergeCells(divRow.number, 3, divRow.number, colCount)
            continue
          }

          if (r.group !== currentGroup) {
            currentGroup = r.group
            const groupRowData: (string | number)[] = [currentGroup, '']
            const emptyCells = Array(colCount - 2).fill('')
            groupRowData.push(...emptyCells)
            const groupRow = sheet.addRow(groupRowData)
            sheet.getRow(sheet.lastRow!.number).eachCell(c => c.style = styleGroupRow)
            sheet.mergeCells(sheet.lastRow!.number, 3, sheet.lastRow!.number, colCount)
          }
          const rowData: (string | number)[] = [no++, r.branch_name ?? '-']
          // 按月读取 jobLabels，与网页逻辑保持一致
          for (const m of monthList) {
            const md = r.monthData[m.key]
            const jobText = md?.jobLabels?.size ? Array.from(md.jobLabels).join(' / ') : ''
            rowData.push(jobText)
          }
          const dataRow = sheet.addRow(rowData)
          sheet.getCell(dataRow.number, 1).style = styleCellLeft
          sheet.getCell(dataRow.number, 2).style = styleCellLeft
          for (let c = 3; c <= colCount; c++) sheet.getCell(dataRow.number, c).style = styleCellCenter
        }
      } else if (viewMode === 'price') {
        const colCount = 2 + monthList.length + 1
        const headerRow1Data: (string | number)[] = ['NO', 'Outlet']
        for (const m of monthList) headerRow1Data.push(m.label)
        headerRow1Data.push('Overall Total')
        const headerRow1 = sheet.addRow(headerRow1Data)
        for (let c = 1; c <= colCount; c++) sheet.getCell(1, c).style = styleHeader

        const headerRow2Data: (string | number)[] = ['', '']
        for (const m of monthList) headerRow2Data.push('Price')
        headerRow2Data.push('')
        const headerRow2 = sheet.addRow(headerRow2Data)
        for (let c = 1; c <= colCount; c++) sheet.getCell(2, c).style = styleSubHeader

        let currentGroup = ''
        let no = 1
        for (const r of groupedRows) {
          // OUTSTATION 分隔行
          if (r.isDivider) {
            const divData: (string | number)[] = ['OUTSTATION', '']
            divData.push(...Array(colCount - 2).fill(''))
            const divRow = sheet.addRow(divData)
            sheet.getRow(divRow.number).eachCell(c => c.style = styleDividerRow)
            sheet.mergeCells(divRow.number, 3, divRow.number, colCount)
            continue
          }

          if (r.group !== currentGroup) {
            currentGroup = r.group
            const groupRowData: (string | number)[] = [currentGroup, '']
            const emptyCells = Array(colCount - 2).fill('')
            groupRowData.push(...emptyCells)
            const groupRow = sheet.addRow(groupRowData)
            sheet.getRow(sheet.lastRow!.number).eachCell(c => c.style = styleGroupRow)
            sheet.mergeCells(sheet.lastRow!.number, 3, sheet.lastRow!.number, colCount)
          }
          const rowData: (string | number)[] = [no++, r.branch_name ?? '-']
          for (const m of monthList) {
            const md = r.monthData[m.key]
            const price = md?.totalPrice ?? 0
            rowData.push(price > 0 ? price : '')
          }
          const yearTotal = monthList.reduce((sum, m) => sum + (r.monthData[m.key]?.totalPrice ?? 0), 0)
          rowData.push(yearTotal > 0 ? yearTotal : '')
          const dataRow = sheet.addRow(rowData)
          sheet.getCell(dataRow.number, 1).style = styleCellLeft
          sheet.getCell(dataRow.number, 2).style = styleCellLeft
          for (let c = 3; c <= colCount; c++) sheet.getCell(dataRow.number, c).style = styleSubTotal
        }

        const totalRowData: (string | number)[] = ['OVERALL TOTAL', '']
        let grandTotalSum = 0
        for (const m of monthList) {
          let sumSub = 0
          for (const r of groupedRows) {
            if(r.isDivider) continue
            const md = r.monthData[m.key]
            sumSub += md?.totalPrice ?? 0
          }
          grandTotalSum += sumSub
          totalRowData.push(sumSub > 0 ? sumSub : '')
        }
        totalRowData.push(grandTotalSum > 0 ? grandTotalSum : '')
        const grandRow = sheet.addRow(totalRowData)
        sheet.getRow(grandRow.number).eachCell(c => c.style = styleGrandTotal)
      } else if (viewMode === 'overall') {
        // ========== Overall Amount View 导出 ==========
        const colCount = 1 + monthList.length + 1
        const headerRow1Data: (string | number)[] = ['Brand / Region']
        for (const m of monthList) headerRow1Data.push(m.label)
        headerRow1Data.push('Annual Total')
        const headerRow1 = sheet.addRow(headerRow1Data)
        for (let c = 1; c <= colCount; c++) sheet.getCell(1, c).style = styleHeader

        const headerRow2Data: (string | number)[] = ['']
        for (const m of monthList) headerRow2Data.push('Amount')
        headerRow2Data.push('')
        const headerRow2 = sheet.addRow(headerRow2Data)
        for (let c = 1; c <= colCount; c++) sheet.getCell(2, c).style = styleSubHeader

        const styleMalaysia = {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FDE047' } } as const,
          font: { bold: true },
          border: borderAll,
          alignment: { horizontal: 'right' as const, vertical: 'middle' as const }
        }
        const styleGrand = {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F59E0B' } } as const,
          font: { bold: true, color: { argb: 'FFFFFFFF' } },
          border: borderAll,
          alignment: { horizontal: 'right' as const, vertical: 'middle' as const }
        }

        for (const row of overallRows) {
          const rowData: (string | number)[] = [row.label]
          row.months.forEach(v => rowData.push(v > 0 ? Number(v.toFixed(2)) : ''))
          rowData.push(row.annual > 0 ? Number(row.annual.toFixed(2)) : '')
          const dataRow = sheet.addRow(rowData)
          const rowStyle = row.kind === 'malaysia' ? styleMalaysia : row.kind === 'grand' ? styleGrand : null
          dataRow.eachCell((cell, ci) => {
            if (ci === 1) {
              cell.style = rowStyle ? { ...rowStyle, alignment: styleCellLeft.alignment } : styleCellLeft
            } else {
              cell.style = rowStyle ?? styleCellRight
              cell.numFmt = '#,##0.00'
            }
          })
        }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      // ========== 动态文件名 ==========
      a.download = `${serviceLabel}_${customerLabel}_Schedule_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Excel download error:', err)
      alert('Excel生成失败，请打开F12控制台查看报错信息')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        Customer Schedule Report ({year})
      </h1>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('full')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'full' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Full Detailed View
          </button>
          <button
            onClick={() => setViewMode('job-summary')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'job-summary' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Job Summary View
          </button>
          <button
            onClick={() => setViewMode('price')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'price' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Price View
          </button>
          <button
            onClick={() => setViewMode('overall')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'overall' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Overall Amount View
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2">
            {customerList.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCustomer(c)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors h-10
                  ${selectedCustomer === c ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="text-base">Service:</span>
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
            disabled={isDownloading}
            className={`px-3 py-2 rounded text-sm transition h-10
              ${isDownloading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            {isDownloading ? 'Generating...' : 'Download Excel'}
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[78vh] border border-slate-200 rounded-lg shadow-sm bg-white">
        {viewMode === 'full' && <CustomerExcelTableFull groupedRows={groupedRows} />}
        {viewMode === 'job-summary' && <CustomerExcelTableSummary groupedRows={groupedRows} mode="job" />}
        {viewMode === 'price' && <CustomerExcelTableSummary groupedRows={groupedRows} mode="price" />}
        {viewMode === 'overall' && <CustomerExcelTableOverall rows={overallRows} />}
      </div>
    </div>
  )
}
