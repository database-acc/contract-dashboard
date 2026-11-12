'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ContractBranchRow = {
  id: bigint
  contract_no: string | null | undefined
  branch_name: string | null
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
  doc_no: string | null
  bill_date: string | null
  description: string | null
  total: number | null
}

// ------------ 和dashboard完全复用工具函数 ------------
function splitServiceTypes(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split('&').map(s => s.trim()).filter(Boolean)
}

function getBillJobType(descRaw: string | null, total: number | null): string | null {
  if (!descRaw) return null
  const d = descRaw.trim().toUpperCase()
  if (d.includes('KITCHEN PIPELINE MANAGEMENT')) return 'KPM'
  if (d.includes('GREASE WASTE MANAGEMENT')) return 'GWM'
  if (d.includes('PLUMBING')) {
    if (total && total >= 1500) return 'KPM'
    return 'KPS'
  }
  if (d.includes('KITCHEN PIPELINE SERVICE')) return 'KPS'
  if (d.includes('GREASE TRAP CLEARANCE')) return 'GTC'
  return null
}

const monthAbbrMap: Record<string, number> = {
  Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,
  Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
}
type ParsedMonthItem = {year:number;month:number}
type ParseResult = {list:ParsedMonthItem[];isMultiMonth:boolean;originalText:string}
function parseBillMonth(monthStr: string | null): ParseResult {
  if (!monthStr) return {list:[],isMultiMonth:false,originalText:''}
  const parts = monthStr.split('&').map(s=>s.trim()).filter(Boolean)
  const isMultiMonth = parts.length>1
  const results:ParsedMonthItem[]=[]
  for(const s of parts){
    const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if(dmy){
      const m=parseInt(dmy[2],10),y=parseInt(dmy[3],10)
      if(m>=1&&m<=12&&y>=2020) results.push({year:y,month:m})
      continue
    }
    const iso = s.match(/^(\d{4})-(\d{1,2})$/)
    if(iso){
      const y=parseInt(iso[1],10),m=parseInt(iso[2],10)
      if(m>=1&&m<=12&&y>=2020) results.push({year:y,month:m})
      continue
    }
    const abbr = s.match(/^([A-Za-z]{3})-(\d{2})$/)
    if(abbr){
      const mStr=abbr[1],yy=parseInt(abbr[2],10)
      const m=monthAbbrMap[mStr]
      if(m) results.push({year:2000+yy,month:m})
    }
  }
  return {list:results,isMultiMonth,originalText:monthStr.trim()}
}

function extractServiceFromContractNo(no:string|null|undefined):string|null{
  if(!no) return null
  const seg=String(no).split('-')
  if(seg.length<2) return null
  const s=seg[1].trim()
  if(['GWM','KPM','KPS','GTC'].includes(s)) return s
  return null
}

function isWorkInMonth(
  freq:string|null,targetYear:number,targetMonth:number,
  startDateStr:string|null,endDateStr:string|null,
  status:string|null,monthOfYear:string|null
):boolean{
  if(status!=='active') return false
  const targetYM=targetYear*12+targetMonth
  let startYM=-Infinity
  if(startDateStr?.trim()){
    const p=startDateStr.trim().split('-').map(Number)
    const sy=p[0],sm=p[1]
    if(!Number.isNaN(sy)&&!Number.isNaN(sm)) startYM=sy*12+sm
  }
  let endYM=Infinity
  if(endDateStr?.trim()){
    const p=endDateStr.trim().split('-').map(Number)
    const ey=p[0],em=p[1]
    if(!Number.isNaN(ey)&&!Number.isNaN(em)) endYM=ey*12+em
  }
  if(targetYM<startYM||targetYM>endYM) return false
  if(monthOfYear?.trim()){
    const arr=monthOfYear.split(',').map(x=>parseInt(x.trim(),10)).filter(n=>!Number.isNaN(n))
    return arr.includes(targetMonth)
  }
  if(freq==='monthly') return true
  if(freq==='quarterly') return [1,4,7,10].includes(targetMonth)
  if(freq==='half_year') return [1,7].includes(targetMonth)
  return false
}

// ---------------- page ----------------
export default function BillContractMismatchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isBoss = searchParams.get('isBoss') === 'true'

  const [filterMinYear, setFilterMinYear] = useState<number>(2026)
  const [loading, setLoading] = useState(false)
  const [rawAllBills, setRawAllBills] = useState<MaintenanceBillRow[]>([])
  const [contracts, setContracts] = useState<ContractBranchRow[]>([])

  const loadData = async ()=>{
    setLoading(true)
    try{
      const {data:billData,error:billErr}=await supabase.from('maintenance_bills').select('*')
      if(billErr) throw billErr
      const {data:ctData,error:ctErr}=await supabase.from('contract_branch').select('*').eq('status','active')
      if(ctErr) throw ctErr
      setRawAllBills(billData as MaintenanceBillRow[])
      setContracts(ctData as ContractBranchRow[])
    }catch(e){
      console.error(e)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    loadData()
  },[])

  // 只拿 project 包含 CONTRACT 的工单
  const contractBills = useMemo(()=>{
    return rawAllBills.filter(b=>{
      if(!b.project) return false
      return b.project.toUpperCase().includes('CONTRACT')
    })
  },[rawAllBills])

  // 合约全部计划key集合
  const contractPlanKeySet = useMemo(()=>{
    const ks=new Set<string>()
    contracts.forEach(ct=>{
      const bName=ct.branch_name?.trim()
      const srv=extractServiceFromContractNo(ct.contract_no)
      if(!bName||!srv||!ct.start_date||!ct.end_date) return
      const sD=new Date(ct.start_date),eD=new Date(ct.end_date)
      if(Number.isNaN(sD.getTime())||Number.isNaN(eD.getTime())) return
      const yStart=Math.max(sD.getFullYear(),filterMinYear)
      const yEnd=eD.getFullYear()
      if(yStart>yEnd) return
      for(let y=yStart;y<=yEnd;y++){
        for(let m=1;m<=12;m++){
          if(isWorkInMonth(ct.frequency,y,m,ct.start_date,ct.end_date,ct.status,ct.month_of_year)){
            const ym=`${y}-${String(m).padStart(2,'0')}`
            ks.add(`${bName}|${srv}|${ym}`)
          }
        }
      }
    })
    return ks
  },[contracts,filterMinYear])

  // 给每一行工单：计算出 match‑key、是否匹配
  const billRowsWithCalc = useMemo(()=>{
    return contractBills.map(bill=>{
      const bName=bill.branch_name?.trim()??''
      let rawJobStr=bill.service_type
      if(!rawJobStr) rawJobStr=getBillJobType(bill.description,bill.total)
      const jobList=splitServiceTypes(rawJobStr)

      const refRaw=bill.schedule_month_ref??bill.month
      const parseRes=parseBillMonth(refRaw)

      // 生成多条key（多服务+多月份），存数组
      const computedKeys:{key:string;isMatched:boolean}[]=[]
      for(const item of parseRes.list){
        if(item.year<filterMinYear) continue
        for(const s of jobList){
          const ymStr=`${item.year}-${String(item.month).padStart(2,'0')}`
          const k=`${bName}|${s}|${ymStr}`
          computedKeys.push({key:k,isMatched:contractPlanKeySet.has(k)})
        }
      }

      const anyMatched = computedKeys.some(x=>x.isMatched)
      return {
        ...bill,
        computedKeys,
        anyMatched
      }
    })
  },[contractBills,contractPlanKeySet,filterMinYear])

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold">CONTRACT Bills Raw Table (With computed Match‑Key)</h1>
          <p className="text-sm text-gray‑500">
            All project=CONTRACT bills. Column "Is‑Any‑Matched": ❌ = no contract plan match (your target data)
          </p>
          <div className="mt‑2 p‑2 bg‑slate‑100 rounded text‑xs font‑mono">
            Min Year:{filterMinYear} | raw:{rawAllBills.length} | contract‑project bills:{contractBills.length}
          </div>
        </div>
        <button onClick={()=>router.back()} className="px‑4 py‑2 border rounded hover:bg‑gray‑100">← Back</button>
      </div>

      <div className="flex items‑center gap‑3 mb‑4">
        <label className="text‑sm font‑medium">Minimum Check Year:</label>
        <select value={filterMinYear} onChange={e=>setFilterMinYear(Number(e.target.value))} className="border px‑2 py‑1 rounded text‑sm">
          <option value={2024}>2024</option>
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
          <option value={2028}>2028</option>
        </select>
        <button onClick={loadData} disabled={loading} className="bg‑red‑600 text‑white px‑5 py‑2 rounded hover:bg‑red‑700 disabled:opacity‑50">
          {loading?'Loading…':'Reload Data'}
        </button>
      </div>

      <div className="overflow‑x‑auto border rounded">
        <table className="min‑w‑full text‑sm border‑collapse">
          <thead className="bg‑slate‑700 text‑white">
            <tr>
              <th className="p‑2 text‑left">Bill Id</th>
              <th className="p‑2 text‑left">Branch Name</th>
              <th className="p‑2 text‑left">ServiceType(raw)</th>
              <th className="p‑2 text‑left">Project</th>
              <th className="p‑2 text‑left">Schedule_month_ref</th>
              <th className="p‑2 text‑left">Month</th>
              <th className="p‑2 text‑left">DocNo</th>
              <th className="p‑2 text‑left">Description</th>
              <th className="p‑2 text‑left">Amount</th>
              <th className="p‑2 text‑left">✅Is‑Any‑Matched</th>
              <th className="p‑2 text‑left">Computed Match‑Key list</th>
            </tr>
          </thead>
          <tbody>
            {billRowsWithCalc.map((row,idx)=>(
              <tr key={Number(row.id)} className={idx%2===0?'bg‑white':'bg‑gray‑50'}>
                <td className="p‑2">{String(row.id)}</td>
                <td className="p‑2">{row.branch_name??'-'}</td>
                <td className="p‑2">{row.service_type??'-'}</td>
                <td className="p‑2">{row.project??'-'}</td>
                <td className="p‑2">{row.schedule_month_ref??'-'}</td>
                <td className="p‑2">{row.month??'-'}</td>
                <td className="p‑2">{row.doc_no??'-'}</td>
                <td className="p‑2 max‑w‑40 truncate">{row.description??'-'}</td>
                <td className="p‑2">{row.total??'-'}</td>
                <td className={`p‑2 font‑bold ${row.anyMatched?'text‑green‑600':'text‑red‑600'}`}>
                  {row.anyMatched?'✅ YES':'❌ NO'}
                </td>
                <td className="p‑2 font‑mono text‑xs max‑w‑72 break‑all">
                  {row.computedKeys.length===0
                    ? <span className="text‑gray‑400">No valid key(skipped)</span>
                    : row.computedKeys.map((kk,i)=>(
                      <div key={i} className={kk.isMatched?'text‑green‑600':'text‑red‑600'}>
                        {kk.isMatched?'✅':'❌'} {kk.key}
                      </div>
                    ))
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt‑4 text‑sm text‑gray‑600">
        <p>🔎 How to find target: Ctrl+F search <strong>❌ NO</strong> → these bills have zero matching contract‑branch plan (the extra/un‑used bills you need)</p>
        <p>Note: "No valid key(skipped)" means this bill cannot parse branch/service/month, will not compare against contract plan.</p>
      </div>
    </div>
  )
}
