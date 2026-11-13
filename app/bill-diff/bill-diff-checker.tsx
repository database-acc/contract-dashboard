'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type MaintenanceBillRow = {
  id: bigint
  branch_name: string | null
  project: string | null
  service_type: string | null
  schedule_month_ref: string | null
  doc_no: string | null
  bill_date: string | null
  month: string | null
  area_code: string | null
}

type DiffRow = {
  doc_no: string
  type: 'added' | 'removed' | 'modified' | 'same'
  old?: MaintenanceBillRow
  new?: MaintenanceBillRow
  diffFields: string[]
}

export default function BillDiffChecker() {
  const [dbBills, setDbBills] = useState<MaintenanceBillRow[]>([])
  const [newBills, setNewBills] = useState<MaintenanceBillRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showSame, setShowSame] = useState(false)
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState<string>('all')

  // 从数据库读取当前 maintenance_bills
  const fetchDbBills = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('maintenance_bills')
      .select('*')
    if (error) console.error(error)
    else setDbBills(data as MaintenanceBillRow[])
    setLoading(false)
  }

  // 改良CSV解析（支持引号包裹带逗号的单元格）
  const parseCSV = (text: string) => {
    const result: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuote = false
    for (const char of text) {
      if (char === '"') {
        inQuote = !inQuote
      } else if (char === ',' && !inQuote) {
        row.push(cell.trim())
        cell = ''
      } else if (char === '\n' && !inQuote) {
        row.push(cell.trim())
        result.push(row)
        row = []
        cell = ''
      } else {
        cell += char
      }
    }
    if (cell || row.length) row.push(cell.trim())
    if (row.length) result.push(row)
    return result
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = parseCSV(text)
    if (lines.length < 2) return
    const headers = lines[0]
    const parsed: MaintenanceBillRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i]
      const row: Record<string, string | null> = {}
      headers.forEach((h, idx) => {
        row[h] = vals[idx] ?? null
      })
      parsed.push({
        id: BigInt(0),
        branch_name: row.branch_name ?? null,
        project: row.project ?? null,
        service_type: row.service_type ?? null,
        schedule_month_ref: row.schedule_month_ref ?? null,
        doc_no: row.doc_no ?? null,
        bill_date: row.bill_date ?? null,
        month: row.month ?? null,
        area_code: row.area_code ?? null,
      })
    }
    setNewBills(parsed)
  }

  const diffResult: DiffRow[] = useMemo(() => {
    const mapDb = new Map<string, MaintenanceBillRow>()
    dbBills.forEach(b => {
      if (b.doc_no) mapDb.set(b.doc_no, b)
    })
    const mapNew = new Map<string, MaintenanceBillRow>()
    newBills.forEach(b => {
      if (b.doc_no) mapNew.set(b.doc_no, b)
    })
    const allDocNos = new Set([...mapDb.keys(), ...mapNew.keys()])
    const diffs: DiffRow[] = []

    const compareFields = [
      'branch_name',
      'project',
      'service_type',
      'schedule_month_ref',
      'bill_date',
      'month',
      'area_code'
    ] as const

    for (const docNo of allDocNos) {
      const old = mapDb.get(docNo)
      const curr = mapNew.get(docNo)
      if (!old && curr) {
        diffs.push({ doc_no: docNo, type: 'added', new: curr, diffFields: [] })
        continue
      }
      if (old && !curr) {
        diffs.push({ doc_no: docNo, type: 'removed', old: old, diffFields: [] })
        continue
      }
      if (old && curr) {
        const changed: string[] = []
        for (const f of compareFields) {
          if (old[f] !== curr[f]) changed.push(f)
        }
        if (changed.length > 0) {
          diffs.push({ doc_no: docNo, type: 'modified', old, new: curr, diffFields: changed })
        } else {
          diffs.push({ doc_no: docNo, type: 'same', old, new: curr, diffFields: [] })
        }
      }
    }
    return diffs
  }, [dbBills, newBills])

  const filtered = useMemo(() => {
    let list = diffResult
    if (!showSame) list = list.filter(d => d.type !== 'same')
    if (filterYear !== 'all') {
      list = list.filter(item => {
        const target = item.new ?? item.old
        if (!target?.bill_date) return false
        return target.bill_date.startsWith(filterYear)
      })
    }
    return list
  }, [diffResult, showSame, filterYear])

  const stats = useMemo(() => ({
    total: diffResult.length,
    added: diffResult.filter(x => x.type === 'added').length,
    removed: diffResult.filter(x => x.type === 'removed').length,
    modified: diffResult.filter(x => x.type === 'modified').length,
    same: diffResult.filter(x => x.type === 'same').length,
  }), [diffResult])

  const exportDiffCSV = () => {
    const header = ['doc_no', 'type', 'changed_fields', 'old_value', 'new_value']
    const rows = filtered.map(r => [
      r.doc_no,
      r.type,
      r.diffFields.join(';'),
      JSON.stringify(r.old),
      JSON.stringify(r.new)
    ])
    const csv = [header, ...rows].map(line => line.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bill_diff_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Maintenance Bills Diff Checker</h2>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <button onClick={fetchDbBills} disabled={loading} className="px-3 py-2 bg-blue-600 text-white rounded">
          {loading ? 'Loading...' : 'Load DB Current Bills'}
        </button>
        <label className="px-3 py-2 bg-green-600 text-white rounded cursor-pointer">
          Upload New CSV
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
        </label>
        <button onClick={exportDiffCSV} className="px-3 py-2 bg-orange-500 text-white rounded">
          Export Diff CSV
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showSame} onChange={e => setShowSame(e.target.checked)} />
          Show Unchanged
        </label>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="border p-2 rounded">
          <option value="all">All Year</option>
          <option value="2025">2025</option>
          <option value="2026">2026</option>
          <option value="2027">2027</option>
        </select>
      </div>

      <div className="mb-4">
        <p>Total: {stats.total} | ✅ Added: {stats.added} | ❌ Removed: {stats.removed} | ✏️ Modified: {stats.modified} | Same: {stats.same}</p>
        <p>Filtered Result Count: {filtered.length}</p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Doc No</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Changed Fields</th>
            <th className="border p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(row => (
            <>
              <tr key={row.doc_no} className={
                row.type === 'added' ? 'bg-green-100' :
                row.type === 'removed' ? 'bg-red-100' :
                row.type === 'modified' ? 'bg-yellow-100' : 'bg-gray-50'
              }>
                <td className="border p-2">{row.doc_no}</td>
                <td className="border p-2">
                  {row.type === 'added' && 'NEW ADDED'}
                  {row.type === 'removed' && 'DELETED (Only in DB)'}
                  {row.type === 'modified' && 'MODIFIED'}
                  {row.type === 'same' && 'NO CHANGE'}
                </td>
                <td className="border p-2">{row.diffFields.join(', ') || '-'}</td>
                <td className="border p-2">
                  <button onClick={() => setExpandedDoc(expandedDoc === row.doc_no ? null : row.doc_no)} className="text-blue-600">
                    {expandedDoc === row.doc_no ? 'Close' : 'View Detail'}
                  </button>
                </td>
              </tr>
              {expandedDoc === row.doc_no && (
                <tr>
                  <td colSpan={4} className="border p-3 bg-slate-50">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-semibold">Old (DB):</p>
                        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(row.old, null, 2)}</pre>
                      </div>
                      <div>
                        <p className="font-semibold">New (File):</p>
                        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(row.new, null, 2)}</pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="border p-4 text-center text-gray-500">No diff data</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
