// useAggregateOutletData.ts
import { useMemo } from 'react'
import type { ContractBranchRow, AggregatedRow, OutletMonthData } from './types'

export const monthList = [
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

export function getServiceType(contractNo: string | null): 'KPS' | 'KPM' | 'GWM' | 'GTC' | null {
  if (!contractNo) return null
  if (contractNo.includes('KPS')) return 'KPS'
  if (contractNo.includes('KPM')) return 'KPM'
  if (contractNo.includes('GWM')) return 'GWM'
  if (contractNo.includes('GTC')) return 'GTC'
  return null
}

export function formatNum(n: number): string {
  return n.toLocaleString('en-MY')
}

export function useAggregateOutletData(filteredData: ContractBranchRow[]): AggregatedRow[] {
  return useMemo(() => {
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

      // 遍历12个月，计算金额
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
        md.totalPrice += monthTotal
        md.midnight += midnight
        md.outstation += outstation
        if (serviceType === 'KPS') md.kps += price
        if (serviceType === 'KPM') md.kpm += price
        if (serviceType === 'GWM') md.gwm += price
        if (serviceType === 'GTC') md.gtc += price

        // ✅ 只有当月金额>0，才把serviceType放进这个月jobLabels
        if (monthTotal > 0) {
          md.jobLabels.add(serviceType)
        }
      }
    }

    const arr = Array.from(map.values())

    // ========== 自定义地区排序规则 ==========
    const REGION_ORDER: Record<string, number> = {
      'KL': 1,
      'Selangor': 2,
      'Putrajaya': 3,
      'Negeri Sembilan': 5,
      'Melaka': 6,
      'Johor': 7,
      'Perak': 8,
      'Penang': 9,
    }
    const getOrder = (g: string) => REGION_ORDER[g] ?? 99

    // 先按自定义地区权重排序，同地区内部按门店名称排序
    arr.sort((a, b) => {
      const oA = getOrder(a.group)
      const oB = getOrder(b.group)
      if (oA !== oB) return oA - oB
      return (a.branch_name ?? '').localeCompare(b.branch_name ?? '')
    })

    // 在 Putrajaya(3) 之后、Negeri Sembilan(5) 之前插入 OUTSTATION 分隔行
    const insertIndex = arr.findIndex(r => getOrder(r.group) >= 5)
    if (insertIndex !== -1) {
      arr.splice(insertIndex, 0, {
        group: 'OUTSTATION',
        branch_name: null,
        monthData: {},
        isDivider: true,
      })
    }

    return arr
  }, [filteredData])
}
