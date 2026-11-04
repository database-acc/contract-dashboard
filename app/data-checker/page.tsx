'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractBranchRow = {
  id: bigint
  contract_no: string | null
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
  month: string | null
  bill_date: string | null
  doc_no: string | null
  total: number | null
}

type CrossCheckErrorItem = {
  errorType: string
  branchName: string
  companyName: string
  year: number
  month: number
  planService: string | null
  billService: string | null
  message: string
}

type CheckStat = {
  totalExpectedPlan: number
  missingBillCount: number
  extraBillCount: number
  serviceMismatchCount: number
  dirtyContractCount: number
  dirtyBillCount: number
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// 从contract_no解析服务类型
function extractService(contractNo: string | null | undefined): string | null {
  if(!contractNo) return null
  const p = String(contractNo).split('-')
  if(p.length >=2){
    const t = p[1].trim()
    if(['GWM','KPM','KPS','GTC'].includes(t)) return t
  }
  return null
}

// 解析month_of_year
function parseMonthOfYear(val:string|null):number[]{
  if(!val) return []
  return val.split(',')
    .map(s=>parseInt(s.trim(),10))
    .filter(n=>!Number.isNaN(n) && n>=1 && n<=12)
}

// 根据frequency获取月份
function getFreqMonths(freq:string|null):number[]{
  if(freq === 'monthly') return [1,2,3,4,5,6,7,8,9,10,11,12]
  if(freq === 'quarterly') return [1,4,7,10]
  if(freq === 'half_year') return [1,7]
  return []
}

// 解析schedule_month_ref
function parseScheduleRef(raw:string|null):Array<{y:number,m:number}>{
  if(!raw) return []
  const res:Array<{y:number,m:number}> = []
  const parts = raw.split('&').map(s=>s.trim()).filter(Boolean)
  for(const it of parts){
    const dash = it.match(/^([A-Za-z]{3})-(\d{2})$/)
    if(dash){
      const idx = MONTH_SHORT.findIndex(x=>x.toLowerCase() === dash[1].toLowerCase())
      if(idx !== -1) res.push({y:2000+Number(dash[2]), m: idx+1})
      continue
    }
    const iso = it.match(/^(\d{4})-(\d{1,2})$/)
    if(iso){
      res.push({y:Number(iso[1]), m:Number(iso[2])})
    }
  }
  return res
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [role, setRole] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(2026)
  const [errorList, setErrorList] = useState<CrossCheckErrorItem[]>([])
  const [stat, setStat] = useState<CheckStat>({
    totalExpectedPlan:0,
    missingBillCount:0,
    extraBillCount:0,
    serviceMismatchCount:0,
    dirtyContractCount:0,
    dirtyBillCount:0
  })

  useEffect(()=>{
    const userRole = 'boss'
    setRole(userRole)
    if(userRole !== 'boss') router.replace('/dashboard')
    setLoading(false)
  },[router])

  if(loading) return <div className="p-6">Checking permission...</div>
  if(role !== 'boss') return null

  const runCrossCheck = async ()=>{
    setErrorList([])
    setStat({
      totalExpectedPlan:0,
      missingBillCount:0,
      extraBillCount:0,
      serviceMismatchCount:0,
      dirtyContractCount:0,
      dirtyBillCount:0
    })

    // 1.读取合同
    const {data:contractRaw,error:errC} = await supabase.from('contract_branch').select('*')
    if(errC){ alert('读取contract_branch失败:'+errC.message); return }
    const contracts = contractRaw as ContractBranchRow[]

    // 2.读取工单，只取project包含CONTRACT
    const {data:billRaw,error:errB} = await supabase.from('maintenance_bills').select('*')
    if(errB){ alert('读取maintenance_bills失败:'+errB.message); return }
    const allBills = billRaw as MaintenanceBillRow[]
    const contractBills = allBills.filter(b=>b.project?.toUpperCase().includes('CONTRACT'))

    const errors:CrossCheckErrorItem[] = []

    // -------- 构建bill索引 map: key = branchName|service|YYYY-MM --------
    type BillMapValue = {bill:MaintenanceBillRow, y:number, m:number, service:string}
    const billIndex = new Map<string, BillMapValue>()
    const seenPlanKeys = new Set<string>()

    contractBills.forEach(bill=>{
      if(!bill.branch_name?.trim() || !bill.service_type?.trim()){
        // 🟨脏数据：工单branch_name/service_type为空
        errors.push({
          errorType:'Dirty Bill',
          branchName: bill.branch_name ?? '(empty)',
          companyName: '-',
          year,
          month:0,
          planService:null,
          billService: bill.service_type,
          message:'Contract bill branch_name / service_type is empty'
        })
        return
      }
      const bName = bill.branch_name.trim()
      const sType = bill.service_type.trim()
      const refList = parseScheduleRef(bill.schedule_month_ref)
      if(refList.length ===0){
        errors.push({
          errorType:'Dirty Bill',
          branchName:bName,
          companyName: '-',
          year,
          month:0,
          planService:null,
          billService:sType,
          message:`schedule_month_ref parse failed:${bill.schedule_month_ref}`
        })
        return
      }
      for(const ref of refList){
        const key = `${bName}|${sType}|${ref.y}-${String(ref.m).padStart(2,'0')}`
        billIndex.set(key, {bill, y:ref.y, m:ref.m, service:sType})
      }
    })

    let totalExpectedPlan = 0

    // --------遍历所有活跃合同，生成预期计划，做cross check --------
    contracts.forEach(ct=>{
      if(!ct.branch_name) return
      const brName = ct.branch_name.trim()
      const planSrv = extractService(ct.contract_no)
      const compName = ct.company_name ?? '-'

      // 检测脏合同：status active但是end_date已经过期
      if(ct.status === 'active' && ct.end_date){
        const endDt = new Date(ct.end_date)
        const now = new Date()
        if(endDt < now){
          errors.push({
            errorType:'Dirty Contract',
            branchName:brName,
            companyName:compName,
            year,
            month:0,
            planService:planSrv,
            billService:null,
            message:`Contract status=active but end_date ${ct.end_date} already expired`
          })
        }
      }

      if(!planSrv) return
      const startY = ct.start_date ? Number(ct.start_date.split('-')[0]) : 2020
      const endY = ct.end_date ? Number(ct.end_date.split('-')[0]) : 2030
      if(year < startY || year> endY) return

      let months:number[] = []
      if(ct.month_of_year?.trim()){
        months = parseMonthOfYear(ct.month_of_year)
      }else{
        months = getFreqMonths(ct.frequency)
      }

      months.forEach(m=>{
        totalExpectedPlan +=1
        const ymKey = `${year}-${String(m).padStart(2,'0')}`
        const lookupKey = `${brName}|${planSrv}|${ymKey}`
        seenPlanKeys.add(lookupKey)

        const matchedBill = billIndex.get(lookupKey)
        if(!matchedBill){
          // 🟥 Missing Bill：有计划无工单
          errors.push({
            errorType:'Missing Bill',
            branchName:brName,
            companyName:compName,
            year,
            month:m,
            planService:planSrv,
            billService:null,
            message:`Plan exists ${MONTH_SHORT[m-1]} ${year}, cannot find corresponding contract bill`
          })
        }else{
          // ✅ 找到工单，校验service是否匹配
          if(matchedBill.service !== planSrv){
            errors.push({
              errorType:'Service Type Mismatch',
              branchName:brName,
              companyName:compName,
              year,
              month:m,
              planService:planSrv,
              billService:matchedBill.service,
              message:`Plan service ${planSrv}, bill service ${matchedBill.service} inconsistent`
            })
          }
        }
      })
    })

    // 🟥 Extra Bill：存在工单，但是没有对应的计划
    billIndex.forEach((val,key)=>{
      const [br,,ym] = key.split('|')
      const [yStr,mStr] = ym.split('-')
      const m = Number(mStr)
      errors.push({
        errorType:'Extra Bill',
        branchName:br,
        companyName: '-',
        year:Number(yStr),
        month:m,
        planService:null,
        billService:val.service,
        message:`Bill exists but no corresponding contract plan ${ym}`
      })
    })

    // 统计各类错误数量
    const missingBillCount = errors.filter(e=>e.errorType === 'Missing Bill').length
    const extraBillCount = errors.filter(e=>e.errorType === 'Extra Bill').length
    const serviceMismatchCount = errors.filter(e=>e.errorType === 'Service Type Mismatch').length
    const dirtyContractCount = errors.filter(e=>e.errorType === 'Dirty Contract').length
    const dirtyBillCount = errors.filter(e=>e.errorType === 'Dirty Bill').length

    setStat({
      totalExpectedPlan,
      missingBillCount,
      extraBillCount,
      serviceMismatchCount,
      dirtyContractCount,
      dirtyBillCount
    })
    setErrorList(errors)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker · Cross‑Check</h1>
          <p className="text-sm text-gray-500">
            Cross‑check contract plan ↔ maintenance bills, detect report data accuracy issues
          </p>
        </div>
        <button onClick={()=>router.back()} className="px-4 py-2 border rounded hover:bg-gray-100">
          ← Back
        </button>
      </div>

      <div className="flex gap-3 items-center mb-6">
        <div className="flex items-center gap-2">
          <span>Year:</span>
          <select value={year} onChange={(e)=>setYear(Number(e.target.value))} className="border px-2 py-1 rounded">
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
        <button onClick={runCrossCheck} className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700">
          Run Cross‑Check
        </button>
      </div>

      {errorList.length>0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <div className="border p-3 rounded bg-slate-50">
            <div className="text-xs text-gray-500">Expected Plan</div>
            <div className="text-lg font-bold">{stat.totalExpectedPlan}</div>
          </div>
          <div className="border p-3 rounded bg-red-50">
            <div className="text-xs text-red-600">Missing Bill</div>
            <div className="text-lg font-bold text-red-700">{stat.missingBillCount}</div>
          </div>
          <div className="border p-3 rounded bg-red-50">
            <div className="text-xs text-red-600">Extra Bill</div>
            <div className="text-lg font-bold text-red-700">{stat.extraBillCount}</div>
          </div>
          <div className="border p-3 rounded bg-orange-50">
            <div className="text-xs text-orange-600">Service Mismatch</div>
            <div className="text-lg font-bold text-orange-700">{stat.serviceMismatchCount}</div>
          </div>
          <div className="border p-3 rounded bg-amber-50">
            <div className="text-xs text-amber-600">Dirty Contract</div>
            <div className="text-lg font-bold text-amber-700">{stat.dirtyContractCount}</div>
          </div>
          <div className="border p-3 rounded bg-amber-50">
            <div className="text-xs text-amber-600">Dirty Bill</div>
            <div className="text-lg font-bold text-amber-700">{stat.dirtyBillCount}</div>
          </div>
        </div>
      )}

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="p-2 text-center w-12">No.</th>
              <th className="p-2 text-left">Error Type</th>
              <th className="p-2 text-left">Branch</th>
              <th className="p-2 text-left">Company</th>
              <th className="p-2 text-center">Year‑Month</th>
              <th className="p-2 text-center">Plan Service</th>
              <th className="p-2 text-center">Bill Service</th>
              <th className="p-2 text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            {errorList.length ===0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  Click Run Cross‑Check to start data cross‑validation. Zero errors = report data is 100% consistent.
                </td>
              </tr>
            ):(
              errorList.map((err,idx)=>(
                <tr key={idx} className={
                  err.errorType === 'Missing Bill' || err.errorType === 'Extra Bill'
                    ? 'bg-red-50'
                    : err.errorType === 'Service Type Mismatch'
                      ? 'bg-orange-50'
                      : 'bg-amber-50'
                }>
                  <td className="p-2 text-center text-gray-500">{idx+1}</td>
                  <td className="p-2 font-semibold">{err.errorType}</td>
                  <td className="p-2">{err.branchName}</td>
                  <td className="p-2">{err.companyName}</td>
                  <td className="p-2 text-center">
                    {err.month>0 ? `${err.year}‑${String(err.month).padStart(2,'0')}` : `${err.year}`}
                  </td>
                  <td className="p-2 text-center">{err.planService ?? '-'}</td>
                  <td className="p-2 text-center">{err.billService ?? '-'}</td>
                  <td className="p-2">{err.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
