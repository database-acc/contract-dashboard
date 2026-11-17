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
    return arr.sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group)
      return (a.branch_name ?? '').localeCompare(b.branch_name ?? '')
    })
  }, [filteredData])
}
