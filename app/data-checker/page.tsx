'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  service_type: string | null
}

type MaintenanceBillRow = {
  id: bigint
  area_code: string | null
  month: string | null
  schedule_month_ref: string | null
  doc_no: string | null
  bill_date: string | null
  company_name: string | null
  branch_name: string | null
}

const monthIndexMap: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
}
const monthList = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const yearList = [2025,2026,2027,2028]

// 【和Dashboard完全一样的排程判断函数】
function isScheduleMatch(row: ContractBranchRow, targetYear: number, targetMonth: string): boolean {
  if (row.status !== 'active') return false
  if (!row.start_date || !row.end_date) return false

  const start = new Date(row.start_date)
  const end = new Date(row.end_date)
  const targetMonthIdx = monthIndexMap[targetMonth]
  const targetDate = new Date(targetYear, targetMonthIdx, 15)

  // 合约时间是否覆盖这个月份
  if (targetDate < start || targetDate > end) return false

  const freq = row.frequency
  const rule = row.schedule_rule
  const timesPerYear = Number(row.times_per_year ?? 0) || 0

  if (freq === 'Monthly') {
    return true
  }
  if (freq === 'Quarterly') {
    // 季度：Jan/Apr/Jul/Oct
    return ['Jan','Apr','Jul','Oct'].includes(targetMonth)
  }
  if (freq === 'Half Yearly') {
    // 半年 Jan / Jul
    return ['Jan','Jul'].includes(targetMonth)
  }
  if (freq === 'Yearly') {
    return row.month_of_year === targetMonth
  }
  if (freq === 'Custom' && timesPerYear > 0 && rule) {
    const ruleArr = rule.split(',').map(s=>s.trim())
    return ruleArr.includes(targetMonth)
  }
  return false
}

export default function DataCheckerPage() {
  const router = useRouter()
  const [selectedYear, setSelectedYear] = useState(2026)
  const [selectedMonth, setSelectedMonth] = useState("Jan")
  const [allContractData, setAllContractData] = useState<ContractBranchRow[]>([])
  const [billList, setBillList] = useState<MaintenanceBillRow[]>([])
  const [loading, setLoading] = useState(false)

  const handleLoad = async () => {
    setLoading(true)
    setAllContractData([])
    setBillList([])
    try {
      // 1. 取出全部 active contract（不再直接筛选month）
      const { data: contractData, error: contractErr } = await supabase
        .from("contract_branch")
        .select("*")
        .eq("status", "active")
      if(contractErr) throw contractErr

      // 用【和Dashboard一模一样的逻辑】过滤出当月计划
      const planList = contractData.filter(item => isScheduleMatch(item, selectedYear, selectedMonth))
      setAllContractData(planList)

      // 2. 拉取对应月份 Bills
      const targetRef = `${selectedYear}-${selectedMonth}`
      const { data: billData, error: billErr } = await supabase
        .from("maintenance_bills")
        .select("*")
        .eq("schedule_month_ref", targetRef)
      if(billErr) throw billErr
      setBillList(billData)
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const stat = useMemo(()=>{
    const gwm = allContractData.filter(i=>i.service_type === "GWM").length
    const kpm = allContractData.filter(i=>i.service_type === "KPM").length
    const kps = allContractData.filter(i=>i.service_type === "KPS").length
    const gtc = allContractData.filter(i=>i.service_type === "GTC").length
    const totalPlan = allContractData.length
    const totalBill = billList.length

    const planBranchNames = allContractData.map(p=>p.branch_name?.trim())
    const billBranchNames = billList.map(b=>b.branch_name?.trim())
    const missingBills = allContractData.filter(p=> !billBranchNames.includes(p.branch_name?.trim()))

    return {gwm,kpm,kps,gtc,totalPlan,totalBill,missingBills: missingBills.length}
  },[allContractData,billList])

  return (
    <div className="p-4 max-w-[100%]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker · Verify Dashboard Plan Count</h1>
          <p className="text-gray-500 text-sm">【复刻Dashboard Monthly Schedule排程逻辑，同页对比计划 + Bill，不用切换页面】</p>
        </div>
        <button onClick={()=>router.back()} className="border px-3 py-1 rounded">← Back</button>
      </div>

      <div className="flex gap-3 items-center mb-4">
        <div className="flex items-center gap-1">
          <span>Year:</span>
          <select value={selectedYear} onChange={(e)=>setSelectedYear(Number(e.target.value))} className="border p-1">
            {yearList.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span>Month:</span>
          <select value={selectedMonth} onChange={(e)=>setSelectedMonth(e.target.value)} className="border p-1">
            {monthList.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <button onClick={handleLoad} disabled={loading} className="bg-red-600 text-white px-4 py-2 rounded font-bold">
          {loading ? "Loading..." : "Load & Calculate Plan Schedule + Bills"}
        </button>
      </div>

      <div className="grid grid-cols-6 gap-3 mb-4">
        <div className="border p-3 rounded bg-white">
          <div className="text-sm text-gray-500">{selectedMonth} {selectedYear} — Total Plan Rows</div>
          <div className="text-2xl font-bold">{stat.totalPlan}</div>
        </div>
        <div className="border p-3 rounded bg-sky-50">
          <div className="text-sm text-sky-600">GWM</div>
          <div className="text-2xl font-bold text-sky-600">{stat.gwm}</div>
        </div>
        <div className="border p-3 rounded bg-violet-50">
          <div className="text-sm text-violet-600">KPM</div>
          <div className="text-2xl font-bold text-violet-600">{stat.kpm}</div>
        </div>
        <div className="border p-3 rounded bg-emerald-50">
          <div className="text-sm text-emerald-600">KPS</div>
          <div className="text-2xl font-bold text-emerald-600">{stat.kps}</div>
        </div>
        <div className="border p-3 rounded bg-amber-50">
          <div className="text-sm text-amber-600">GTC</div>
          <div className="text-2xl font-bold text-amber-600">{stat.gtc}</div>
        </div>
        <div className="border p-3 rounded bg-rose-50">
          <div className="text-sm text-rose-600">Missing Bill</div>
          <div className="text-2xl font-bold text-rose-600">{stat.missingBills}</div>
        </div>
      </div>

      <div className="text-amber-600 text-sm mb-3">
        💡 校验说明：完全复用Monthly Schedule排程规则，Missing Bill = 有保养计划，但还没有开出Bill的分店
      </div>

      <h2 className="font-bold text-lg mb-2">✅ Planned Schedule List</h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full border-collapse border">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="border p-2">No.</th>
              <th className="border p-2">Branch Name</th>
              <th className="border p-2">Company</th>
              <th className="border p-2">Service</th>
            </tr>
          </thead>
          <tbody>
            {allContractData.map((row,idx)=>{
              const hasBill = billList.some(b=>b.branch_name?.trim() === row.branch_name?.trim())
              return (
                <tr key={idx} className={hasBill ? "bg-white" : "bg-red-50"}>
                  <td className="border p-2">{idx+1}</td>
                  <td className="border p-2">{row.branch_name}</td>
                  <td className="border p-2">{row.company_name}</td>
                  <td className="border p-2">{row.service_type}</td>
                </tr>
              )
            })}
            {allContractData.length === 0 && <tr><td colSpan={4} className="text-center p-3 text-gray-500">No schedule for this month</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="font-bold text-lg mb-2">📄 Generated Maintenance Bills</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="border p-2">No.</th>
              <th className="border p-2">Branch Name</th>
              <th className="border p-2">Company</th>
              <th className="border p-2">Doc No.</th>
              <th className="border p-2">Bill Date</th>
            </tr>
          </thead>
          <tbody>
            {billList.map((row,idx)=>(
              <tr key={idx} className="bg-white">
                <td className="border p-2">{idx+1}</td>
                <td className="border p-2">{row.branch_name}</td>
                <td className="border p-2">{row.company_name}</td>
                <td className="border p-2">{row.doc_no}</td>
                <td className="border p-2">{row.bill_date}</td>
              </tr>
            ))}
            {billList.length === 0 && <tr><td colSpan={5} className="text-center p-3 text-gray-500">No bills found for this month</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
