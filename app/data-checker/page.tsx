'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Workbook } from 'exceljs'
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

const monthList = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const yearList = [2025,2026,2027,2028]

export default function DataCheckerPage() {
  const router = useRouter()
  const [selectedYear, setSelectedYear] = useState(2026)
  const [selectedMonth, setSelectedMonth] = useState("Jan")
  const [planList, setPlanList] = useState<ContractBranchRow[]>([])
  const [billList, setBillList] = useState<MaintenanceBillRow[]>([])
  const [loading, setLoading] = useState(false)

  const handleLoad = async () => {
    setLoading(true)
    setPlanList([])
    setBillList([])
    try {
      // 1. 查询计划 schedule
      const { data: planData, error: planErr } = await supabase
        .from("contract_branch")
        .select("*")
        .eq("month_of_year", selectedMonth)
        .eq("status", "active")
      if(planErr) throw planErr

      // 过滤年份
      const filteredPlan = planData.filter(row=>{
        if(!row.start_date || !row.end_date) return false
        const startY = new Date(row.start_date).getFullYear()
        const endY = new Date(row.end_date).getFullYear()
        return startY <= selectedYear && endY >= selectedYear
      })
      setPlanList(filteredPlan)

      // 2. 查询对应月份的 bills
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

  // 统计
  const stat = useMemo(()=>{
    const gwm = planList.filter(i=>i.service_type === "GWM").length
    const kpm = planList.filter(i=>i.service_type === "KPM").length
    const kps = planList.filter(i=>i.service_type === "KPS").length
    const gtc = planList.filter(i=>i.service_type === "GTC").length
    const totalPlan = planList.length
    const totalBill = billList.length

    // 找出有计划、但是没有对应bill的branch
    const planBranchNames = planList.map(p=>p.branch_name?.trim())
    const billBranchNames = billList.map(b=>b.branch_name?.trim())
    const missingBills = planList.filter(p=> !billBranchNames.includes(p.branch_name?.trim()))

    return {gwm,kpm,kps,gtc,totalPlan,totalBill,missingBills: missingBills.length}
  },[planList,billList])

  return (
    <div className="p-4 max-w-[100%]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker · Verify Dashboard Plan Count</h1>
          <p className="text-gray-500 text-sm">【同页同时显示计划Schedule + 已开出Bill工单，自动比对，不用切换页面】</p>
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

      {/* 统计卡片 */}
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
        💡 校验说明：本页同时加载【计划保养清单】和【已生成工单】，Missing Bill = 有保养计划，但还没有开出Bill的分店
      </div>

      {/* 表格1：Plan Schedule */}
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
            {planList.map((row,idx)=>{
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
          </tbody>
        </table>
      </div>

      {/* 表格2：Bills */}
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
