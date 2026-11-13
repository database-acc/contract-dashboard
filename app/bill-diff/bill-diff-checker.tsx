'use client'
import { useState, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type BillRow = {
  area_code: string | null
  month: string | null
  doc_no: string | null
  bill_date: string | null
  company_name: string | null
  description: string | null
  agent: string | null
  area: string | null
  project: string | null
  total: string | null
  branch_name: string | null
  schedule_month_ref: string | null
  service_type: string | null
}

const COMPARE_FIELDS: (keyof BillRow)[] = [
  'area_code',
  'month',
  'doc_no',
  'bill_date',
  'company_name',
  'description',
  'agent',
  'area',
  'project',
  'total',
  'branch_name',
  'schedule_month_ref',
  'service_type'
]

type DiffItem = {
  doc_no: string
  status: 'added' | 'removed' | 'modified' | 'same'
  old?: BillRow
  new?: BillRow
  changedFields: string[]
  diffMap: Record<string, { oldVal: string; newVal: string }>
}

// 内置CSV解析，不依赖csv-parse
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0])
  const result: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] ?? ''
    })
    result.push(row)
  }
  return result
}

function splitCsvLine(line: string): string[] {
  const res: string[] = []
  let current = ''
  let insideQuote = false
  for (const char of line) {
    if (char === '"') {
      insideQuote = !insideQuote
    } else if (char === ',' && !insideQuote) {
      res.push(current)
      current = ''
    } else {
      current += char
    }
  }
  res.push(current)
  return res
}

export default function BillDiffChecker() {
  const [dbBills, setDbBills] = useState<BillRow[]>([])
  const [csvBills, setCsvBills] = useState<BillRow[]>([])
  const [yearFilter, setYearFilter] = useState('All Year')
  const [showUnchanged, setShowUnchanged] = useState(true)
  const [detailItem, setDetailItem] = useState<DiffItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDB = async () => {
    const { data, error } = await supabase
      .from('maintenance_bills')
      .select('area_code,month,doc_no,bill_date,company_name,description,agent,area,project,total,branch_name,schedule_month_ref,service_type')
    if (error) {
      alert(error.message)
      return
    }
    const list = (data ?? []) as BillRow[]
    console.log('DB Bills loaded, total:', list.length)
    console.log('DB month sample:', list.slice(0,10).map(x => x.month))
    setDbBills(list)
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      const records = parseCSV(text)
      const parsed: BillRow[] = records.map(r => ({
        area_code: r.area_code ?? null,
        month: r.month ?? null,
        doc_no: r.doc_no ?? null,
        bill_date: r.bill_date ?? null,
        company_name: r.company_name ?? null,
        description: r.description ?? null,
        agent: r.agent ?? null,
        area: r.area ?? null,
        project: r.project ?? null,
        total: r.total ?? null,
        branch_name: r.branch_name ?? null,
        schedule_month_ref: r.schedule_month_ref ?? null,
        service_type: r.service_type ?? null
      }))
      console.log('CSV Bills loaded, total:', parsed.length)
      console.log('CSV month sample:', parsed.slice(0,10).map(x => x.month))
      setCsvBills(parsed)
    }
    reader.readAsText(file)
  }

  const diffList: DiffItem[] = useMemo(() => {
    const dbMap = new Map<string, BillRow>()
    dbBills.forEach(item => {
      if (item.doc_no?.trim()) dbMap.set(item.doc_no.trim(), item)
    })
    const csvMap = new Map<string, BillRow>()
    csvBills.forEach(item => {
      if (item.doc_no?.trim()) csvMap.set(item.doc_no.trim(), item)
    })

    const allDocNos = new Set([...dbMap.keys(), ...csvMap.keys()])
    const result: DiffItem[] = []

    for (const docNo of allDocNos) {
      const old = dbMap.get(docNo)
      const newRow = csvMap.get(docNo)
      const diffMap: Record<string, { oldVal: string; newVal: string }> = {}
      const changedFields: string[] = []

      if (!old && newRow) {
        result.push({ doc_no: docNo, status: 'added', new: newRow, changedFields: [], diffMap })
        continue
      }
      if (old && !newRow) {
        result.push({ doc_no: docNo, status: 'removed', old, changedFields: [], diffMap })
        continue
      }

      for (const field of COMPARE_FIELDS) {
        const o = old![field] ?? ''
        const n = newRow![field] ?? ''
        if (String(o).trim() !== String(n).trim()) {
          changedFields.push(field)
          diffMap[field] = { oldVal: String(o), newVal: String(n) }
        }
      }
      if (changedFields.length > 0) {
        result.push({ doc_no: docNo, status: 'modified', old, new: newRow, changedFields, diffMap })
      } else {
        result.push({ doc_no: docNo, status: 'same', old, new: newRow, changedFields: [], diffMap })
      }
    }
    return result
  }, [dbBills, csvBills])

  const filtered = useMemo(() => {
    const res = diffList.filter(row => {
      if (yearFilter === 'All Year') return true
      const targetYear = yearFilter
      const billMonth = row.new?.month || row.old?.month || ''
      return billMonth.startsWith(targetYear)
    })
    console.log('Filter year:', yearFilter, 'count:', res.length)
    return res
  }, [diffList, yearFilter])

  const stats = useMemo(() => {
    const total = filtered.length
    const added = filtered.filter(i => i.status === 'added').length
    const removed = filtered.filter(i => i.status === 'removed').length
    const modified = filtered.filter(i => i.status === 'modified').length
    const same = filtered.filter(i => i.status === 'same').length
    return { total, added, removed, modified, same }
  }, [filtered])

  const exportDiff = () => {
    const lines = [
      'doc_no,status,changed_fields,field,old_value,new_value'
    ]
    filtered.forEach(item => {
      if (item.status === 'modified') {
        Object.entries(item.diffMap).forEach(([f, v]) => {
          lines.push(`${item.doc_no},${item.status},${item.changedFields.join('|')},${f},"${v.oldVal}","${v.newVal}"`)
        })
      } else {
        lines.push(`${item.doc_no},${item.status},,,,`)
      }
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bill_diff_result.csv'
    a.click()
  }

  const displayRows = showUnchanged ? filtered : filtered.filter(i => i.status !== 'same')

  const statusLabel: Record<string, string> = {
    added: 'ADDED',
    removed: 'REMOVED',
    modified: 'MODIFIED',
    same: 'SAME'
  }
  const statusColor: Record<string, string> = {
    added: '#dcfce7',
    removed: '#fee2e2',
    modified: '#fff9cc',
    same: '#f1f5f9'
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h2>Maintenance Bills Diff Checker</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={loadDB} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6 }}>Load DB Current Bills</button>
        <button onClick={() => fileInputRef.current?.click()} style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6 }}>Upload New CSV</button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleUpload} hidden />
        <button onClick={exportDiff} style={{ padding: '8px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6 }}>Export Diff CSV</button>
        <label><input type="checkbox" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} /> Show Unchanged</label>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: 6 }}>
          <option>All Year</option>
          <option>2025</option>
          <option>2026</option>
          <option>2027</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        Total: {stats.total} | ✅ Added: {stats.added} | ❌ Removed: {stats.removed} | 📝 Modified: {stats.modified} | ✔ Same: {stats.same}
        <br />
        Filtered Result Count: {displayRows.length}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Doc No</th>
            <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Status</th>
            <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Changed Fields</th>
            <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map(row => (
            <tr key={row.doc_no} style={{ backgroundColor: statusColor[row.status] }}>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>{row.doc_no}</td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>{statusLabel[row.status]}</td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>{row.changedFields.join(', ') || '-'}</td>
              <td style={{ border: '1px solid #ccc', padding: 8 }}>
                <button onClick={() => setDetailItem(row)} style={{ color: '#2563eb' }}>View Detail</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 999 }} onClick={() => setDetailItem(null)}>
          <div style={{ background: '#fff', padding: 20, width: 700, maxHeight: '80vh', overflow: 'auto', borderRadius: 8 }} onClick={e => e.stopPropagation()}>
            <h3>Doc No: {detailItem.doc_no}</h3>
            <p>Status: {statusLabel[detailItem.status]}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#eee' }}>
                  <th style={{ border: '1px solid #ccc', padding: 6 }}>Field</th>
                  <th style={{ border: '1px solid #ccc', padding: 6 }}>Old (DB)</th>
                  <th style={{ border: '1px solid #ccc', padding: 6 }}>New (CSV)</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_FIELDS.map(field => {
                  const oldVal = detailItem.old?.[field] ?? '-'
                  const newVal = detailItem.new?.[field] ?? '-'
                  const isDiff = detailItem.diffMap[field]
                  return (
                    <tr key={field} style={{ background: isDiff ? '#fff9cc' : '#fff' }}>
                      <td style={{ border: '1px solid #ccc', padding: 6 }}>{field}</td>
                      <td style={{ border: '1px solid #ccc', padding: 6 }}>{oldVal}</td>
                      <td style={{ border: '1px solid #ccc', padding: 6 }}>{newVal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button onClick={() => setDetailItem(null)} style={{ marginTop: 12, padding: '6px 12px' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
