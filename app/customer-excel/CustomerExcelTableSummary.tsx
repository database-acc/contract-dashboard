import React from 'react'
import { formatNum, monthList } from './useAggregateOutletData'
import type { AggregatedRow } from './types'

type SummaryMode = 'job' | 'price'
type Props = {
  groupedRows: AggregatedRow[]
  mode: SummaryMode
}

export default function CustomerExcelTableSummary({ groupedRows, mode }: Props) {
  const renderRows = () => {
    const rows: React.ReactNode[] = []
    let no = 1
    let currentGroup = ''
    groupedRows.forEach((r, idx) => {
      if (r.group !== currentGroup) {
        currentGroup = r.group
        const groupCells: React.ReactNode[] = []
        monthList.forEach((m) => {
          if(mode === 'job'){
            groupCells.push(
              <td key={`g-${m.key}-job`} className="border border-slate-200 p-2"></td>
            )
          }else{
            groupCells.push(
              <td key={`g-${m.key}-price`} className="border border-slate-200 p-2 border-r-2 border-slate-400"></td>
            )
          }
        })
        if(mode !== 'job'){
          groupCells.push(<td key={`g-overall`} className="border border-sky-200 p-2 bg-sky-50 font-bold"></td>)
        }
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
        if(mode === 'job'){
          // ✅ 重点：取【当月】的job，不是全部job
          const jobText = md?.jobLabels?.size ? Array.from(md.jobLabels).join(' / ') : ''
          cells.push(
            <td key={`${m.key}-job`} className="border border-slate-200 p-2 text-center">{jobText}</td>
          )
        }else{
          const price = md?.totalPrice ?? 0
          cells.push(
            <td key={`${m.key}-price`} className="border border-slate-200 p-2 text-right border-r-2 border-slate-400">{price > 0 ? formatNum(price) : ''}</td>
          )
        }
      })
      if(mode !== 'job'){
        const outletYearTotal = monthList.reduce((sum, m) => sum + (r.monthData[m.key]?.totalPrice ?? 0), 0)
        cells.push(
          <td key={`overall-${idx}`} className="border border-sky-200 p-2 text-right bg-sky-50 font-bold">
            {outletYearTotal > 0 ? formatNum(outletYearTotal) : ''}
          </td>
        )
      }
      rows.push(
        <tr key={`r-${idx}`} className="hover:bg-slate-50">
          <td className="border border-slate-200 p-2" style={{ position: 'sticky', left: 0, zIndex: 12, background: '#fff' }}>{no++}</td>
          <td className="border border-slate-200 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, zIndex: 12, background: '#fff' }}>{r.branch_name ?? '-'}</td>
          {...cells}
        </tr>
      )
    })

    const totalCells: React.ReactNode[] = []
    if(mode !== 'job'){
      let grandTotalSum = 0
      monthList.forEach((m) => {
        let sumSub = 0
        groupedRows.forEach(r => {
          const md = r.monthData[m.key]
          sumSub += md?.totalPrice ?? 0
        })
        grandTotalSum += sumSub
        totalCells.push(
          <td key={`t-${m.key}-price`} className="border border-sky-300 border-t-2 border-b-2 p-2 text-right bg-sky-200 font-bold border-r-2 border-slate-400">{sumSub > 0 ? formatNum(sumSub) : ''}</td>
        )
      })
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
    }
    return rows
  }

  if(mode === 'job'){
    return (
      <table className="border-collapse text-sm" style={{ minWidth: '1200px', width: 'max-content' }}>
        <thead>
          <tr className="bg-slate-200">
            <th rowSpan={2} className="border border-slate-300 p-2" style={{ position: 'sticky', left: 0, top: 0, zIndex: 15, background: '#e2e8f0' }}>NO</th>
            <th rowSpan={2} className="border border-slate-300 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, top: 0, zIndex: 15, background: '#e2e8f0' }}>Outlet</th>
            {monthList.map((m) => (
              <th key={`month-${m.key}`} className="border border-slate-300 p-2" style={{ position: 'sticky', top: 0, zIndex: 11, background: '#e2e8f0' }}>{m.label}</th>
            ))}
          </tr>
          <tr className="bg-slate-100">
            {monthList.map((m) => (
              <th key={`sub-${m.key}`} className="border border-slate-300 p-2" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>Job</th>
            ))}
          </tr>
        </thead>
        <tbody>{renderRows()}</tbody>
      </table>
    )
  }
  return (
    <table className="border-collapse text-sm" style={{ minWidth: '1400px', width: 'max-content' }}>
      <thead>
        <tr className="bg-slate-200">
          <th rowSpan={2} className="border border-slate-300 p-2" style={{ position: 'sticky', left: 0, top: 0, zIndex: 15, background: '#e2e8f0' }}>NO</th>
          <th rowSpan={2} className="border border-slate-300 p-2 whitespace-nowrap" style={{ position: 'sticky', left: 54, top: 0, zIndex: 15, background: '#e2e8f0' }}>Outlet</th>
          {monthList.map((m) => (
            <th key={`month-${m.key}`} className="border border-slate-300 p-2 border-r-2 border-slate-400" style={{ position: 'sticky', top: 0, zIndex: 11, background: '#e2e8f0' }}>{m.label}</th>
          ))}
          <th rowSpan={2} className="border border-sky-300 p-2 bg-sky-50 font-bold" style={{ position: 'sticky', top: 0, zIndex: 11 }}>Overall Total</th>
        </tr>
        <tr className="bg-slate-100">
          {monthList.map((m) => (
            <th key={`sub-${m.key}`} className="border border-slate-300 p-2 border-r-2 border-slate-400" style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}>Price</th>
          ))}
        </tr>
      </thead>
      <tbody>{renderRows()}</tbody>
    </table>
  )
}
