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
  description: string | null
  total: number | null
}

type BillMatchItem = {
  billId: bigint
  branchName: string | null
  serviceType: string | null
  docNo: string | null
  billDate: string | null
  scheduleRef: string | null
  description: string | null
  total: number | null
  refYear: number | null
  refMonth: number | null
  matchKey: string
  isMatched: boolean
}

// 和dashboard复用：根据description自动识别service_type
function getBillJobType(descRaw: string | null, total: number | null): string | null {
  if (!descRaw) return null
  const d = descRaw.trim().toUpperCase()
  if (d.includes('KITCHEN PIPELINE MANAGEMENT')) return 'KPM'
  if (d.includes('GREASE WASTE MANAGEMENT')) return 'GWM'
  if (d.includes('PLUMBING')) {
    if (total && total >= 1500) {
      return 'KPM'
    } else {
      return 'KPS'
    }
  }
  if (d.includes('KITCHEN PIPELINE SERVICE')) return 'KPS'
  if (d.includes('GREASE TRAP CLEARANCE')) return 'GTC'
  return null
}

// 复用：解析 schedule_month_ref
type ParseRefResult = {
  year: number | null
  month: number | null
}
function parseScheduleRef(refStr: string | null): ParseRefResult {
  if (!refStr) return { year: null, month: null }
  const parts = refStr.split('&').map(s => s.trim()).filter(Boolean)
  const first = parts[0]
  if (!first) return { year: null, month: null }

  // 2026-01
  const iso = first.match(/^(\d{4})-(\d{1,2})$/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const m = parseInt(iso[2], 10)
    if (y >= 2020 && m >= 1 && m <= 12) return { year: y, month: m }
  }

  // dd/mm/yyyy
  const dmy = first.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) {
    const m = parseInt(dmy[2], 10)
    const y = parseInt(dmy[3], 10)
    if (y >= 2020 && m >= 1 && m <= 12) return { year: y, month: m }
  }
  return { year: null, month: null }
}

// 从 contract_no 提取服务类型 GWM / KPM / KPS / GTC
function extractServiceFromContractNo(no: string | null | undefined): string | null {
  if (!no) return null
  const seg = String(no).split('-')
  if (seg.length < 2) return null
  const s = seg[1].trim()
  if (['GWM', 'KPM', 'KPS', 'GTC'].includes(s)) return s
  return null
}

// 判断该 contract_branch 在指定年月是否生成计划（和data‑checker完全相同逻辑）
function shouldContractProducePlan(
  ct: ContractBranchRow,
  targetY: number,
  targetM: number
): boolean {
  if (ct.status !== 'active') return false
  if (!ct.start_date || !ct.end_date) return false
  const startD = new Date(ct.start_date)
  const endD = new Date(ct.end_date)
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return false
  const targetD = new Date(targetY, targetM - 1, 10)
  if (targetD < startD || targetD > endD) return false

  if (ct.month_of_year && ct.month_of_year.trim()) {
    const nums = ct.month_of_year.split(',')
      .map(x => parseInt(x.trim(), 10))
      .filter(n => !Number.isNaN(n) && n >= 1 && n <= 12)
    if (nums.length > 0) {
      return nums.includes(targetM)
    }
  }
  const freq = ct.frequency?.trim() ?? ''
  if (freq === 'monthly') return true
  if (freq === 'quarterly') return [1, 4, 7, 10].includes(targetM)
  if (freq === 'half_year' || freq === 'half‑year') return [1, 7].includes(targetM)
  return false
}

export default function BillContractMismatchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isBoss = searchParams.get('isBoss') === 'true'

  const [loading, setLoading] = useState(false)
  const [rawAllBills, setRawAllBills] = useState<MaintenanceBillRow[]>([])
  const [contracts, setContracts] = useState<ContractBranchRow[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      // 全部拿回来，js过滤project包含contract，规避supabase ilike大小写坑
      const { data: billData, error: billErr } = await supabase
        .from('maintenance_bills')
        .select('*')
      if (billErr) throw billErr

      const { data: ctData, error: ctErr } = await supabase
        .from('contract_branch')
        .select('*')
        .eq('status', 'active')
      if (ctErr) throw ctErr

      setRawAllBills(billData as MaintenanceBillRow[])
      setContracts(ctData as ContractBranchRow[])
      console.log('原始全部bills:', billData)
      console.log('active合约:', ctData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // 页面首次挂载自动加载
  useEffect(() => {
    loadData()
  }, [])

  // JS层过滤：project包含contract，忽略大小写、前后空格
  const contractBills = useMemo(() => {
    return rawAllBills.filter(bill => {
      if (!bill.project) return false
      const p = bill.project.trim().toLowerCase()
      return p.includes('contract')
    })
  }, [rawAllBills])

  // 构建合约匹配map key = `${branch}|${service}|${yyyy‑MM}`
  const contractPlanKeySet = useMemo(() => {
    const keySet = new Set<string>()
    contracts.forEach(ct => {
      const bName = ct.branch_name
      const srv = extractServiceFromContractNo(ct.contract_no)
      if (!bName || !srv) return
      if (!ct.start_date || !ct.end_date) return
      const startD = new Date(ct.start_date)
      const endD = new Date(ct.end_date)
      if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return

      const yStart = startD.getFullYear()
      const yEnd = endD.getFullYear()
      for (let y = yStart; y <= yEnd; y++) {
        for (let m = 1; m <= 12; m++) {
          if (shouldContractProducePlan(ct, y, m)) {
            const ymKey = `${y}-${String(m).padStart(2, '0')}`
            const finalKey = `${bName.trim()}|${srv}|${ymKey}`
            keySet.add(finalKey)
          }
        }
      }
    })
    return keySet
  }, [contracts])

  const billMatchList: BillMatchItem[] = useMemo(() => {
    const res: BillMatchItem[] = []
    contractBills.forEach(bill => {
      const bName = bill.branch_name
      // 如果service_type为空，复用dashboard逻辑从description推导
      let srv = bill.service_type
      if (!srv) {
        srv = getBillJobType(bill.description, bill.total)
      }
      const { year: refY, month: refM } = parseScheduleRef(bill.schedule_month_ref)
      if (!bName || !srv || !refY || !refM) {
        return
      }

      const ymStr = `${refY}-${String(refM).padStart(2, '0')}`
      const matchKey = `${bName.trim()}|${srv}|${ymStr}`
      const isMatched = contractPlanKeySet.has(matchKey)

      res.push({
        billId: bill.id,
        branchName: bName,
        serviceType: srv,
        docNo: bill.doc_no,
        billDate: bill.bill_date,
        scheduleRef: bill.schedule_month_ref,
        description: bill.description,
        total: bill.total,
        refYear: refY,
        refMonth: refM,
        matchKey,
        isMatched
      })
    })
    return res
  }, [contractBills, contractPlanKeySet])

  const mismatchList = billMatchList.filter(x => !x.isMatched)
  const matchedList = billMatchList.filter(x => x.isMatched)

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">CONTRACT Bills vs Contract‑Branch Mismatch Check</h1>
          <p className="text-sm text-gray-500">
            Find CONTRACT maintenance bills which CANNOT match any active contract‑branch plan.
          </p>
          {/* ✅ 调试统计面板 */}
          <div className="mt-2 p-2 bg-slate-100 rounded text-xs font-mono">
            raw bills from DB: {rawAllBills.length} |
            filtered contract bills: {contractBills.length} |
            parsed valid bill items: {billMatchList.length} |
            <span className="text-green-600"> Matched: {matchedList.length}</span> |
            <span className="text-red-600"> Mismatch(Extra Bill): {mismatchList.length}</span>
          </div>
        </div>
        <button onClick={() => router.back()} className="px-4 py-2 border rounded hover:bg-gray-100">← Back</button>
      </div>

      <button
        onClick={loadData}
        disabled={loading}
        className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700 disabled:opacity-50 mb-6"
      >
        {loading ? 'Loading…' : 'Reload Contract & CONTRACT Bills'}
      </button>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2 text-red-600">⚠️ Mismatch Bills (No corresponding active contract plan found)</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-red-50 text-red-800">
              <tr>
                <th className="p-2 text-left">Bill Id</th>
                <th className="p-2 text-left">Branch Name</th>
                <th className="p-2 text-left">Service Type</th>
                <th className="p-2 text-left">Doc No</th>
                <th className="p-2 text-left">Bill Date</th>
                <th className="p-2 text-left">Schedule Month Ref</th>
                <th className="p-2 text-left">Match‑Key</th>
                <th className="p-2 text-left">Amount</th>
                <th className="p-2 text-left">Description</th>
              </tr>
            </thead>
            <tbody>
              {mismatchList.length === 0 ? (
                <tr><td colSpan={9} className="p-4 text-center text-gray-400">No mismatch extra CONTRACT bills found</td></tr>
              ) : (
                mismatchList.map((item) => (
                  <tr key={Number(item.billId)} className="bg-white">
                    <td className="p-2">{String(item.billId)}</td>
                    <td className="p-2">{item.branchName ?? '-'}</td>
                    <td className="p-2 font-semibold">{item.serviceType ?? '-'}</td>
                    <td className="p-2">{item.docNo ?? '-'}</td>
                    <td className="p-2">{item.billDate ?? '-'}</td>
                    <td className="p-2">{item.scheduleRef ?? '-'}</td>
                    <td className="p-2 font-mono text-xs">{item.matchKey}</td>
                    <td className="p-2">{item.total ?? '-'}</td>
                    <td className="p-2 max-w-52 truncate">{item.description ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2 text-green-700">✅ Matched Bills (Has corresponding contract‑branch plan)</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm border-collapse">
            <thead className="bg-green-50 text-green-800">
              <tr>
                <th className="p-2 text-left">Bill Id</th>
                <th className="p-2 text-left">Branch Name</th>
                <th className="p-2 text-left">Service Type</th>
                <th className="p-2 text-left">Doc No</th>
                <th className="p-2 text-left">Schedule Month Ref</th>
                <th className="p-2 text-left">Match‑Key</th>
              </tr>
            </thead>
            <tbody>
              {matchedList.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-gray-400">No matched bills</td></tr>
              ) : (
                matchedList.map((item) => (
                  <tr key={Number(item.billId)} className="bg-white">
                    <td className="p-2">{String(item.billId)}</td>
                    <td className="p-2">{item.branchName ?? '-'}</td>
                    <td className="p-2 font-semibold">{item.serviceType ?? '-'}</td>
                    <td className="p-2">{item.docNo ?? '-'}</td>
                    <td className="p-2">{item.scheduleRef ?? '-'}</td>
                    <td className="p-2 font-mono text-xs">{item.matchKey}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
