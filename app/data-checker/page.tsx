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
  service_type: string | null
  status: string | null
  price: number | null
  project: string | null
}

type CheckResult = {
  branchName: string
  companyName: string
  month: string
  planService: string | null
  doneService: string | null
  planCount: number
  doneCount: number
  isMatch: boolean
  remark: string
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function extractServiceFromContractNo(contractNo: string | null | undefined): string | null {
  if (!contractNo) return null
  const parts = String(contractNo).split('-')
  if (parts.length >= 2) {
    const t = parts[1].trim()
    if (['GWM','KPM','KPS','GTC'].includes(t)) return t
  }
  return null
}

function parseMonthOfYear(val: string | null): number[] {
  if (!val) return []
  return val.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !Number.isNaN(n) && n >= 1 && n <= 12)
}

function getFreqMonths(freq: string | null): number[] {
  if (freq === 'monthly') return [1,2,3,4,5,6,7,8,9,10,11,12]
  if (freq === 'quarterly') return [1,4,7,10]
  if (freq === 'half_year') return [1,7]
  return []
}

function parseScheduleMonth(raw: string | null): Array<{ y: number; m: number }> {
  if (!raw) return []
  const out: Array<{ y: number; m: number }> = []
  const items = raw.split('&').map(s => s.trim()).filter(Boolean)
  for (const it of items) {
    const dashMatch = it.match(/^([A-Za-z]{3})-(\d{2})$/)
    if (dashMatch) {
      const mIdx = MONTH_SHORT.findIndex(x => x.toLowerCase() === dashMatch[1].toLowerCase())
      if (mIdx !== -1) {
        out.push({ y: 2000 + Number(dashMatch[2]), m: mIdx + 1 })
      }
      continue
    }
    const isoMatch = it.match(/^(\d{4})-(\d{1,2})$/)
    if (isoMatch) {
      out.push({ y: Number(isoMatch[1]), m: Number(isoMatch[2]) })
    }
  }
  return out
}

export default function DataValidationChecker() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(2026)
  const [checkResults, setCheckResults] = useState<CheckResult[]>([])

  useEffect(() => {
    const userRole = 'boss'
    setRole(userRole)
    if (userRole !== 'boss') {
      router.replace('/dashboard')
    }
    setLoading(false)
  }, [router])

  if (loading) return <div className="p-6">Checking permission...</div>
  if (role !== 'boss') return null

  const runCheck = async () => {
    setCheckResults([])

    const { data: contractsRaw, error: errC } = await supabase
      .from('contract_branch')
      .select('*')
      .eq('status', 'active')

    if (errC) {
      alert('读取contract_branch失败: ' + errC.message)
      return
    }

    const contracts = contractsRaw as ContractBranchRow[]

    const { data: billsRaw, error: errB } = await supabase
      .from('maintenance_bills')
      .select('*')

    if (errB) {
      alert('读取maintenance_bills失败: ' + errB.message)
      return
    }

    const billsAll = billsRaw as MaintenanceBillRow[]

    const contractBills = billsAll.filter(b => {
      if (!b.project) return false
      return b.project.toUpperCase().includes('CONTRACT')
    })

    const billMap = new Map<string, MaintenanceBillRow>()

    contractBills.forEach(bill => {
      if (!bill.branch_name || !bill.service_type) return
      const bName = bill.branch_name.trim()
      const sType = bill.service_type.trim()
      const monthList = parseScheduleMonth(bill.schedule_month_ref ?? bill.month)

      for (const sm of monthList) {
        const key = `${bName}|${sType}|${sm.y}-${String(sm.m).padStart(2, '0')}`
        if (!billMap.has(key)) {
          billMap.set(key, bill)
        }
      }
    })

    const output: CheckResult[] = []

    contracts.forEach(ct => {
      if (!ct.branch_name) return
      const brName = ct.branch_name.trim()
      const srv = extractServiceFromContractNo(ct.contract_no)
      if (!srv) return

      const startY = ct.start_date ? Number(ct.start_date.split('-')[0]) : 2020
      const endY = ct.end_date ? Number(ct.end_date.split('-')[0]) : 2030

      if (year < startY || year > endY) return

      let targetMonths: number[] = []

      if (ct.month_of_year && ct.month_of_year.trim()) {
        targetMonths = parseMonthOfYear(ct.month_of_year)
      } else {
        targetMonths = getFreqMonths(ct.frequency)
      }

      targetMonths.forEach(m => {
        const ymKey = `${year}-${String(m).padStart(2, '0')}`
        const lookupKey = `${brName}|${srv}|${ymKey}`
        const matchedBill = billMap.get(lookupKey)

        let remark = ''
        let isMatch = false
        let doneSrv: string | null = null
        let doneCnt = 0
        const planCnt = 1

        if (matchedBill) {
          isMatch = true
          doneSrv = matchedBill.service_type
          doneCnt = 1
          remark = 'OK：计划与账单匹配'
        } else {
          isMatch = false
          remark = '🔴Missing bill：存在计划，未找到对应合同工单'
          doneSrv = null
          doneCnt = 0
        }

        output.push({
          branchName: brName,
          companyName: ct.company_name ?? '-',
          month: `${MONTH_SHORT[m - 1]} ${year}`,
          planService: srv,
          doneService: doneSrv,
          planCount: planCnt,
          doneCount: doneCnt,
          isMatch,
          remark
        })
      })
    })

    output.sort((a, b) => {
      if (a.branchName.localeCompare(b.branchName) !== 0) {
        return a.branchName.localeCompare(b.branchName)
      }
      return a.month.localeCompare(b.month)
    })

    setCheckResults(output)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Data Validation Checker</h1>
          <p className="text-gray-500 text-sm">
            Cross‑check contract plan vs maintenance bills【Only project containing CONTRACT】
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          ← Back
        </button>
      </div>

      <div className="flex gap-3 items-center mb-6">
        <div>
          <span className="mr-2">Year:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border px-2 py-1 rounded"
          >
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>
        <button
          onClick={runCheck}
          className="bg-red-600 text-white px-5 py-2 rounded hover:bg-red-700"
        >
          Run Validation Check
        </button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="p-2 text-center w-12">No.</th>
              <th className="p-2 text-left">Outlet / Branch</th>
              <th className="p-2 text-left">Company</th>
              <th className="p-2 text-center">Month</th>
              <th className="p-2 text-center">Plan Service</th>
              <th className="p-2 text-center">Done Service</th>
              <th className="p-2 text-center">Plan Qty</th>
              <th className="p-2 text-center">Done Qty</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-left">Remark</th>
            </tr>
          </thead>
          <tbody>
            {checkResults.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  Click [Run Validation Check] to start cross checking
                </td>
              </tr>
            ) : (
              checkResults.map((row, idx) => (
                <tr
                  key={idx}
                  className={row.isMatch ? 'bg-green-50' : 'bg-red-50'}
                >
                  <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                  <td className="p-2">{row.branchName}</td>
                  <td className="p-2">{row.companyName}</td>
                  <td className="p-2 text-center">{row.month}</td>
                  <td className="p-2 text-center">{row.planService ?? '-'}</td>
                  <td className="p-2 text-center">{row.doneService ?? '-'}</td>
                  <td className="p-2 text-center">{row.planCount}</td>
                  <td className="p-2 text-center">{row.doneCount}</td>
                  <td className="p-2 text-center font-semibold">
                    {row.isMatch ? '✅ Match' : '❌ Mismatch'}
                  </td>
                  <td className="p-2">{row.remark}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
