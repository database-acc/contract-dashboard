import React from 'react'
import { monthList, formatMoney2 } from './useAggregateOutletData'
import type { OverallRow } from './types'

type Props = {
  rows: OverallRow[]
}

/**
 * Overall Amount View：按 品牌 × 地区(KL / Outstation / Malaysia) 汇总每月金额
 * - data      : 普通明细行（KL / OUTSTATION）
 * - malaysia  : 品牌 Malaysia 合计行（黄底）
 * - grand     : 全部品牌 Malaysia 总计行（橙底）
 */
export default function CustomerExcelTableOverall({ rows }: Props) {
  const rowStyle = (kind: OverallRow['kind']): React.CSSProperties => {
    if (kind === 'malaysia') return { background: '#fde047', fontWeight: 700 }
    if (kind === 'grand') return { background: '#f59e0b', fontWeight: 700, color: '#fff' }
    return {}
  }

  return (
    <table className="border-collapse text-sm" style={{ minWidth: '1400px', width: 'max-content' }}>
      <thead>
        <tr className="bg-slate-200">
          <th
            rowSpan={2}
            className="border border-slate-300 p-2 whitespace-nowrap text-left"
            style={{ position: 'sticky', left: 0, top: 0, zIndex: 15, background: '#e2e8f0' }}
          >
            Brand / Region
          </th>
          {monthList.map((m) => (
            <th
              key={`month-${m.key}`}
              className="border border-slate-300 p-2 border-r-2 border-slate-400"
              style={{ position: 'sticky', top: 0, zIndex: 11, background: '#e2e8f0' }}
            >
              {m.label}
            </th>
          ))}
          <th
            rowSpan={2}
            className="border border-sky-300 p-2 bg-sky-50 font-bold"
            style={{ position: 'sticky', top: 0, zIndex: 11 }}
          >
            Annual Total
          </th>
        </tr>
        <tr className="bg-slate-100">
          {monthList.map((m) => (
            <th
              key={`sub-${m.key}`}
              className="border border-slate-300 p-2 border-r-2 border-slate-400"
              style={{ position: 'sticky', top: 36, zIndex: 11, background: '#f1f5f9' }}
            >
              Amount
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} style={rowStyle(row.kind)} className="hover:bg-slate-50">
            <td
              className="border border-slate-200 p-2 whitespace-nowrap"
              style={{ position: 'sticky', left: 0, zIndex: 12, ...rowStyle(row.kind) }}
            >
              {row.label}
            </td>
            {row.months.map((v, i) => (
              <td
                key={`${row.key}-${monthList[i].key}`}
                className="border border-slate-200 p-2 text-right border-r-2 border-slate-400"
              >
                {formatMoney2(v)}
              </td>
            ))}
            <td className="border border-sky-200 p-2 text-right bg-sky-50 font-bold">
              {formatMoney2(row.annual)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
