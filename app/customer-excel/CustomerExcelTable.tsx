'use client'
import React, { useState, useMemo } from 'react'
import { Workbook } from 'exceljs'
import { useRouter } from 'next/navigation'
import CustomerExcelTableFull from './CustomerExcelTableFull'
import CustomerExcelTableSummary from './CustomerExcelTableSummary'
import { useAggregateOutletData, monthList, getServiceType } from './useAggregateOutletData'
import type { ContractBranchRow } from './types'

type ViewMode = 'full' | 'job-summary' | 'price'
type Props = {
  rawData: ContractBranchRow[]
}

const serviceOptions = [
  { value: 'all', label: 'All Service' },
  { value: 'GWM', label: 'GWM' },
  { value: 'KPM', label: 'KPM' },
  { value: 'KPS', label: 'KPS' },
  { value: 'GTC', label: 'GTC' },
]

export default function CustomerExcelTable({ rawData }: Props) {
  const router = useRouter()
  const [year, setYear] = useState<number>(2026)
  const [viewMode, setViewMode] = useState<ViewMode>('full')
  const [selectedCustomer, setSelectedCustomer] = useState<string>("All")
  const [selectedService, setSelectedService] = useState<string>("all")
  const customerList = ["All", "CBTL", "Nando's"]

  const yearFilteredData = useMemo(() => {
    return rawData.filter((row) => {
      if (!row.start_date || !row.end_date) return false
      const s = new Date(row.start_date)
      const e = new Date(row.end_date)
      return s.getFullYear() <= year && e.getFullYear() >= year
    })
  }, [rawData, year])

  const filteredData = useMemo(() => {
    let list = yearFilteredData
    if (selectedCustomer !== "All") {
      list = list.filter(item => item.branch_name?.startsWith(selectedCustomer))
    }
    if (selectedService !== "all") {
      list = list.filter(r => {
        const st = getServiceType(r.contract_no)
        return st === selectedService
      })
    }
    return list
  }, [yearFilteredData, selectedCustomer, selectedService])

  const groupedRows = useAggregateOutletData(filteredData)

  const handleExport = async () => {
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet(`${year}_Schedule`)
    // 这里你原来的Excel导出逻辑，直接复制过来，按viewMode判断分支
    // 你原来完整handleExport直接粘贴回来即可
    // 分支判断：viewMode === 'full' / 'job-summary' / 'price'
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        Customer Schedule Report ({year})
      </h1>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('full')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'full' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Full Detailed View
          </button>
          <button
            onClick={() => setViewMode('job-summary')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'job-summary' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Job Summary View
          </button>
          <button
            onClick={() => setViewMode('price')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors h-10
              ${viewMode === 'price' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
          >
            Price View
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-2">
            {customerList.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCustomer(c)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors h-10
                  ${selectedCustomer === c ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="text-base">Service:</span>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 text-base min-w-[160px] bg-white h-10"
          >
            {serviceOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-slate-200 px-2 py-2 rounded text-sm bg-white h-10"
          >
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
            <option value={2028}>2028</option>
          </select>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-3 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded text-sm transition h-10"
          >
            Back to Dashboard
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition h-10"
          >
            Download Excel
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[78vh] border border-slate-200 rounded-lg shadow-sm bg-white">
        {viewMode === 'full' && <CustomerExcelTableFull groupedRows={groupedRows} />}
        {viewMode === 'job-summary' && <CustomerExcelTableSummary groupedRows={groupedRows} mode="job" />}
        {viewMode === 'price' && <CustomerExcelTableSummary groupedRows={groupedRows} mode="price" />}
      </div>
    </div>
  )
}
