import React from 'react'
import { formatNum, monthList } from './useAggregateOutletData'
import type { AggregatedRow } from './types'

type Props = {
  groupedRows: AggregatedRow[]
}

export default function CustomerExcelTableFull({ groupedRows }: Props) {
  const renderRows = () => {
    const rows: React.ReactNode[] = []
    let no = 1
    let currentGroup = ''
    groupedRows.forEach((r, idx) => {
      // ========== OUTSTATION 分隔行 ==========
      if (r.isDivider) {
        rows.push(
          <tr key={`div-${idx}`}>
            <td
              colSpan={2 + monthList.length * 7 + 1}
              className="border border-amber-300 p-2 font-bold"
              style={{ background: '#FEF3C6' }}
            >
              OUTSTATION
            </td>
          </tr>
        )
        return
      }

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
        // 跳过分隔行，分隔行monthData是空对象，不会参与求和
        if (r.isDivider) return
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

  return (
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
      <tbody>{renderRows()}</tbody>
    </table>
  )
}
