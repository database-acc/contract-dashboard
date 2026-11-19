import React from 'react'
import { monthList, formatMoney2 } from './useAggregateOutletData'
import type { OverallRow, BrandKey } from './types'

type Props = {
  rows: OverallRow[]
}

/**
 * 品牌合计底色
 * NANDOS: bg-orange-50 → #fff7ed
 * CBTL: bg-violet-50 → #f5f3ff
 */
const BRAND_TOTAL_FILL: Record<BrandKey, string> = {
  NANDOS: '#fff7ed',
  CBTL: '#f5f3ff',
  TC: '#F3E8D8',
}

/** 全品牌总计底色，和 Nandos 保持一致 #fff7ed */
const GRAND_FILL = '#fff7ed'

/**
 * Overall Amount View：按 品牌 × 地区(KL / Outstation / Total) 汇总每月金额
 * - data        : 普通明细行（KL / OUTSTATION）
 * - brand-total : 品牌合计行（按品牌分色）
 * - grand       : 全部品牌总计行（#fff7ed）
 */
export default function CustomerExcelTableOverall({ rows }: Props) {
  const rowFill = (row: OverallRow): string | undefined => {
    if (row.kind === 'grand') return GRAND_FILL
    if (row.kind === 'brand-total' && row.brand) return BRAND_TOTAL_FILL[row.brand]
    return undefined
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
            className="border border-slate-300 p-2 font-bold"
            style={{ position: 'sticky', top: 0, zIndex: 11, background: GRAND_FILL }}
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
        {rows.map((row: OverallRow) => {
          const fill = rowFill(row)
          const isBold = row.kind !== 'data'
          return (
            <tr key={row.key} style={fill ? { background: fill, fontWeight: isBold ? 700 : 400 } : undefined}>
              <td
                className="border border-slate-200 p-2 whitespace-nowrap"
                style={{ position: 'sticky', left: 0, zIndex: 12, background: fill ?? '#fff' }}
              >
                {row.label}
              </td>
              {row.months.map((v: number | null, i: number) => (
                <td
                  key={`${row.key}-${monthList[i].key}`}
                  className="border border-slate-200 p-2 text-right border-r-2 border-slate-400"
                >
                  {formatMoney2(v ?? 0)}
                </td>
              ))}
              {/* Annual Total 单元格跟随本行底色 */}
              <td
                className="border border-slate-200 p-2 text-right font-bold"
                style={{ background: fill ?? '#fff' }}
              >
                {formatMoney2(row.annual ?? 0)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
