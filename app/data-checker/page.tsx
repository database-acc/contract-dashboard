'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractBranchRow = {
  id: bigint
  contract_no: string | null | undefined
  branch_name: string | null
  company_name: string | null
  frequency: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  month_of_year: string | null
}

type MaintenanceBillRow = {
  id: bigint
  branch_name: string | null
  project: string | null
  service_type: string | null
  schedule_month_ref: string | null
  doc_no: string | null
  bill_date: string | null
}

type TheoryPlanItem = {
  branchName: string
  companyName: string
  serviceType: string | null
}

type BillItem = {
  branchName: string
  serviceType: string | null
  docNo: string | null
  billDate: string | null
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * ✅【独立排程算法，完全独立，不复制DashboardStateWrapper代码，用于校验Dashboard是否准确】
 * 返回 true：这条contract_branch，在targetYear-targetMonthNum应该生成计划
 * @param targetYear 例如2026
 * @param targetMonthNum 1-12
 */
function independentCalcShouldRunPlan(
  contract: ContractBranchRow,
  targetYear: number,
  targetMonthNum: number
): boolean {
  // 1.只看active合约
  if (contract.status !== 'active') return false

  // 2.校验合约有效期 start_date ~ end_date 是否覆盖目标年月
  if (!contract.start_date || !contract.end_date) return false
  const start = new Date(contract.start_date)
  const end = new Date(contract.end_date)

  const targetDate = new Date(targetYear, targetMonthNum - 1, 10)
  // 合约开始 > 目标月 OR 合约结束 < 目标月 → 不在有效期
  if (targetDate < start || targetDate > end) return false

  // 3. month_of_year 优先；逗号分割数字 1-12
  if (contract.month_of_year && contract.month_of_year.trim() !== '') {
    const nums = contract.month_of_year.split(',')
      .map(s => parseInt(s.trim(),10))
      .filter(n => !Number.isNaN(n) && n>=1 && n<=12)
    return nums.includes(targetMonthNum)
  }

  // 4. frequency规则
  const freq = contract.frequency?.trim() ?? ''
  if (freq === 'monthly') return true
  if (freq === 'quarterly') {
    return [1,4,7,10].includes(targetMonthNum)
  }
  if (freq === 'half_year' || freq === 'half-year') {
    return [1,7].includes(targetMonthNum)
  }

  return false
}

// 从contract_no提取服务类型 GWM/KPM/KPS/GTC
function extractSrv(no: string | null | undefined): string | null {
  if (!no) return null
  const parts = String(no).split('-')
  if (parts.length <2) return null
  const s = parts[1].trim()
  if(['GWM','KPM','KPS','GTC'].includes(s)) return s
  return null
}

// 解析schedule_month_ref 取出 {year,monthNum}
function parseScheduleRef(refStr: string | null): {y:number,m:number} | null {
  if (!refStr) return null
  const iso = refStr.match(/^(\d{4})-(\d{1,2})$/)
  if (iso) {
    const y = parseInt(iso[1],10)
    const m = parseInt(iso[2],10)
    if(y>=2020 && m>=1 && m<=12) return {y,m}
  }
  return null
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [monthNum, setMonthNum] = useState(1)

  const [allContracts, setAllContracts] = useState<ContractBranchRow[]>([])
  const [billsRaw, setBillsRaw] = useState<MaintenanceBillRow[]>([])
  const [loading, setLoading] = useState(false)

  const monthLabel = MONTH_ABBR[monthNum-1]

  // 独立演算：理论上应该有的计划清单
  const theoryPlanList: TheoryPlanItem[] = useMemo(()=>{
    const res: TheoryPlanItem[] = []
    allContracts.forEach(ct=>{
      const ok = independentCalcShouldRunPlan(ct, year, monthNum)
      if(!ok) return
      const srv = extractSrv(ct.contract_no)
      res.push({
        branchName: ct.branch_name ?? '(empty)',
        companyName: ct.company_name ?? '-',
        serviceType: srv
      })
    })
    res.sort((a,b)=>a.branchName.localeCompare(b.branchName))
    return res
  },[allContracts, year, monthNum])

  // 过滤出当前年月，project=CONTRACT的工单
  const currentMonthBills: BillItem[] = useMemo(()=>{
    const res: BillItem[] = []
    billsRaw.forEach(bill=>{
      if(!bill.project?.toUpperCase().includes('CONTRACT')) return
      const parsed = parseScheduleRef(bill.schedule_month_ref)
      if(!parsed) return
      if(parsed.y !== year || parsed.m !== monthNum) return

      res.push({
        branchName: bill.branch_name ?? '(empty)',
        serviceType: bill.service_type,
        docNo: bill.doc_no,
        billDate: bill.bill_date
      })
    })
    return res
  },[billsRaw, year, monthNum])

  // 统计
  const stat = useMemo(()=>{
    const totalTheory = theoryPlanList.length
    const gwm = theoryPlanList.filter(x=>x.serviceType === 'GWM').length
    const kpm = theoryPlanList.filter(x=>x.serviceType === 'KPM').length
    const kps = theoryPlanList.filter(x=>x.serviceType === 'KPS').length
    const gtc = theoryPlanList.filter(x=>x.serviceType === 'GTC').length

    // 构建key 分支|服务
    const planKeySet = new Set(theoryPlanList.map(p=>`${p.branchName}|${p.serviceType}`))
    const billKeySet = new Set(currentMonthBills.map(b=>`${b.branchName}|${b.serviceType}`))

    // Missing Bill：理论存在计划，没有对应工单
    let missingBill = 0
    planKeySet.forEach(k=>{
      if(!billKeySet.has(k)) missingBill++
    })

    // Extra Bill：有工单，但是理论没有计划
    let extraBill =0
    billKeySet.forEach(k=>{
      if(!planKeySet.has(k)) extraBill++
    })

    return {totalTheory, gwm,kpm,kps,gtc, missingBill, extraBill, realBillCount: currentMonthBills.length}
  },[theoryPlanList, currentMonthBills])

  const loadAll = async ()=>{
    setLoading(true)
    try{
      const {data:cData, error:cErr} = await supabase.from('contract_branch').select('*').eq('status','active')
      if(cErr) throw cErr
      setAllContracts(cData as ContractBranchRow[])

      const {data:bData, error:bErr} = await supabase.from('maintenance_bills').select('*')
      if(bErr) throw bErr
      setBillsRaw(bData as MaintenanceBillRow[])
    }catch(e){
      console.error(e)
    }finally{
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker — Independent Cross-Check</h1>
          <p className="text-sm text-gray-500">
            ⚠️【独立演算逻辑，不和DashboardStateWrapper共享代码】用于校验Dashboard Monthly Schedule计算是否准确。
            对比：本页面输出理论计划清单 VS Dashboard页面显示清单，数量不一致代表Dashboard存在BUG。
          </p>
        </div>
        <button onClick={()=>router.back()} className="px-4 py-2 border rounded hover:bg-gray-100">← Back</button>
      </div>

      <div className="flex gap-3 items-center mb-4">
        <div className="flex items-center gap-1">
          <span>Year:</span>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} className="border px-2 py-1 rounded">
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
            <option value={2028}>2028</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span>Month:</span>
          <select value={monthNum} onChange={e=>setMonthNum(Number(e.target.value))} className="border px-2 py-1 rounded">
            {MONTH_ABBR.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <button onClick={loadAll} disabled={loading} className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50">
          {loading ? 'Loading…' : 'Load & Independent Calculate'}
        </button>
      </div>

      <div className="bg-slate-100 p-2 mb-4 text-sm">
        Debug Info: Active Contracts loaded = {allContracts.length}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
        <div className="border rounded p-3 bg-slate-50">
          <div className="text-xs text-gray-500">{monthLabel} {year} Theory Total Plan</div>
          <div className="text-2xl font-bold">{stat.totalTheory}</div>
        </div>
        <div className="border rounded p-3 bg-sky-50">
          <div className="text-xs text-sky-600">GWM</div>
          <div className="text-2xl font-bold text-sky-700">{stat.gwm}</div>
        </div>
        <div className="border rounded p-3 bg-violet-50">
          <div className="text-xs text-violet-600">KPM</div>
          <div className="text-2xl font-bold text-violet-700">{stat.kpm}</div>
        </div>
        <div className="border rounded p-3 bg-emerald-50">
          <div className="text-xs text-emerald-600">KPS</div>
          <div className="text-2xl font-bold text-emerald-700">{stat.kps}</div>
        </div>
        <div className="border rounded p-3 bg-amber-50">
          <div className="text-xs text-amber-600">GTC</div>
          <div className="text-2xl font-bold text-amber-700">{stat.gtc}</div>
        </div>
        <div className="border rounded p-3 bg-rose-50">
          <div className="text-xs text-rose-600">Missing Bill</div>
          <div className="text-2xl font-bold text-rose-700">{stat.missingBill}</div>
        </div>
        <div className="border rounded p-3 bg-orange-50">
          <div className="text-xs text-orange-600">Extra Bill</div>
          <div className="text-2xl font-bold text-orange-700">{stat.extraBill}</div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">1. 🧮 Independent Calculated: Theory Should-Be Plan List</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-slate-700 text-white">
              <tr>
                <th className="p-2 text-center w-12">No.</th>
                <th className="p-2 text-left">Branch</th>
                <th className="p-2 text-left">Company</th>
                <th className="p-2 text-center">ServiceType</th>
              </tr>
            </thead>
            <tbody>
              {theoryPlanList.length ===0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-gray-400">No theory plan for {monthLabel} {year}</td></tr>
              ) : (
                theoryPlanList.map((row,idx)=>(
                  <tr key={idx} className={idx%2===0?'bg-white':'bg-gray-50'}>
                    <td className="p-2 text-center text-gray-500">{idx+1}</td>
                    <td className="p-2">{row.branchName}</td>
                    <td className="p-2">{row.companyName}</td>
                    <td className="p-2 text-center font-semibold">{row.serviceType ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">2. 📄 Real Maintenance Bills (project contains CONTRACT) for {monthLabel} {year}</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-slate-700 text-white">
              <tr>
                <th className="p-2 text-center w-12">No.</th>
                <th className="p-2 text-left">Branch</th>
                <th className="p-2 text-center">ServiceType</th>
                <th className="p-2 text-left">Doc No</th>
                <th className="p-2 text-left">Bill Date</th>
              </tr>
            </thead>
            <tbody>
              {currentMonthBills.length ===0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400">No real bills found</td></tr>
              ) : (
                currentMonthBills.map((row,idx)=>(
                  <tr key={idx} className={idx%2===0?'bg-white':'bg-gray-50'}>
                    <td className="p-2 text-center text-gray-500">{idx+1}</td>
                    <td className="p-2">{row.branchName}</td>
                    <td className="p-2 text-center font-semibold">{row.serviceType ?? '-'}</td>
                    <td className="p-2">{row.docNo ?? '-'}</td>
                    <td className="p-2">{row.billDate ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <strong>✅校验操作步骤：</strong>
        <ol className="list-decimal pl-5 mt-1 space-y-1">
          <li>在本页面选择同样的年月，点击 <code>Load & Independent Calculate</code></li>
          <li>记下【Theory Total Plan】数字，同时打开 Dashboard，选择<strong>完全相同的年月</strong>，看Monthly Schedule表格总行数</li>
          <li>两个数字对比：
            <ul className="list-disc pl-5">
              <li>数字完全一样 → Dashboard排程计算逻辑正确</li>
              <li>数字不一样 → DashboardStateWrapper存在BUG，逐行对比两张表格找出差异行</li>
            </ul>
          </li>
        </ol>
      </div>
    </div>
  )
}
