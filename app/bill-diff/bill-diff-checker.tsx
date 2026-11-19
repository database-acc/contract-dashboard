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

// ✅ 修复标准CSV解析（支持 "" 转义引号）
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = []
  let currentLine = ''
  let insideQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i+1]
    if (c === '"') {
      if (insideQuote && next === '"') {
        currentLine += '"'
        i++
      } else {
        insideQuote = !insideQuote
      }
    } else if ((c === '\n' || c === '\r') && !insideQuote) {
      if (c === '\r' && next === '\n') i++
      lines.push(currentLine)
      currentLine = ''
    } else {
      currentLine += c
    }
  }
  if (currentLine) lines.push(currentLine)

  const validLines = lines.filter(line => line.trim() !== '')
  if (validLines.length === 0) return []

  const headers = splitCsvLine(validLines[0])
  const result: Record<string, string>[] = []
  for (let i = 1; i < validLines.length; i++) {
    const values = splitCsvLine(validLines[i])
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
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDB = async () => {
    setLoading(true)
    const PAGE_SIZE = 1000
    let allData: BillRow[] = []
    let from = 0
    let fetchMore = true

    try {
      while (fetchMore) {
        const { data, error } = await supabase
          .from('maintenance_bills')
          .select('area_code,month,doc_no,bill_date,company_name,description,agent,area,project,total,branch_name,schedule_month_ref,service_type')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error
        if (!data || data.length === 0) {
          fetchMore = false
        } else {
          allData = [...allData, ...(data as BillRow[])]
          from += PAGE_SIZE
        }
      }
      setDbBills(allData)
      console.log('✅ DB Bills loaded ALL, total:', allData.length)
    } catch (err: any) {
      alert('Load DB error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const text = evt.target?.result as string
        const records = parseCSV(text)
        if (records.length === 0) {
          alert('CSV 里面没有数据，请检查文件！')
          return
        }
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
        setCsvBills(parsed)
        console.log('CSV loaded total:', parsed.length)
      } catch (err) {
        alert('CSV解析失败，文件格式不对！')
      }
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
      let status: DiffItem['status'] = 'same'

      if (!old && newRow) {
        status = 'added'
      } else if (old && !newRow) {
        status = 'removed'
      } else if (old && newRow) {
        for (const field of COMPARE_FIELDS) {
          const o = old[field] ?? ''
          const n = newRow[field] ?? ''
          if (String(o).trim() !== String(n).trim()) {
            changedFields.push(field)
            diffMap[field] = { oldVal: String(o), newVal: String(n) }
          }
        }
        if (changedFields.length > 0) status = 'modified'
      }

      result.push({ doc_no: docNo, status, old, new: newRow, changedFields, diffMap })
    }
    return result
  }, [dbBills, csvBills])

  const filtered = useMemo(() => {
    return diffList.filter(row => {
      if (yearFilter === 'All Year') return true
      const targetYear = yearFilter
      const billMonth = row.new?.month || row.old?.month || ''
      return billMonth.startsWith(targetYear)
    })
  }, [diffList, yearFilter])

  const stats = useMemo(() => {
    const total = filtered.length
    const added = filtered.filter(i => i.status === 'added').length
    const removed = filtered.filter(i => i.status === 'removed').length
    const modified = filtered.filter(i => i.status === 'modified').length
    const same = filtered.filter(i => i.status === 'same').length
    return { total, added, removed, modified, same }
  }, [filtered])

  const displayRows = useMemo(() => {
    if (showUnchanged) return filtered
    return filtered.filter(i => i.status !== 'same')
  }, [filtered, showUnchanged])

  const exportDiffCSV = () => {
    const header = ['doc_no','status','changedFields','old_value','new_value']
    const lines: string[] = [header.join(',')]
    filtered.forEach(item => {
      if (item.status === 'modified') {
        item.changedFields.forEach(f => {
          const d = item.diffMap[f]
          lines.push([item.doc_no, item.status, f, `"${d.oldVal}"`, `"${d.newVal}"`].join(','))
        })
      } else {
        lines.push([item.doc_no, item.status, '-', `"${item.old?.doc_no ?? ''}"`, `"${item.new?.doc_no ?? ''}"`].join(','))
      }
    })
    // ✅ Windows Excel兼容 \r\n
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bill_diff_result.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const statusLabel: Record<string, string> = {
    added: 'ADDED',
    removed: 'REMOVED',
    modified: 'MODIFIED',
    same: 'SAME'
  }
  const statusColor: Record<string, string> = {
    added: '#dcfce7',
    removed: '#fee2e2',
    modified: '#fffbeb',
    same: '#f1f5f9'
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h2>Maintenance Bills Diff Checker</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={loadDB} disabled={loading} style={{ padding: '8px 14px', background: loading ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6 }}>
          {loading ? 'Loading...' : 'Load DB Current Bills'}
        </button>
        <button onClick={() => fileInputRef.current?.click()} style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6 }}>Upload New CSV</button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleUpload} hidden />
        <button onClick={exportDiffCSV} style={{ padding: '8px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6 }}>Export Diff CSV</button>
        <label><input type="checkbox" checked={showUnchanged} onChange={e => setShowUnchanged(e.target.checked)} /> Show Unchanged</label>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{ padding: 6 }}>
          <option>All Year</option>
          <option>2025</option>
          <option>2026</option>
          <option>2027</option>
        </select>
      </div>

      <div style={{ marginBottom:12 }}>
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
                <button onClick={() => setDetailItem(row)} style={{ color: '#2563eb', border: 'none', background: 'none', cursor: 'pointer' }}>View Detail</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 999 }} onClick={() => setDetailItem(null)}>
          <div style={{ background: '#fff', padding: 20, width: 'min(700px, 90vw)', maxHeight: '80vh', overflow: 'auto', borderRadius: 8 }} onClick={e => e.stopPropagation()}>
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
                    <tr key={field} style={{ background: isDiff ? '#fffbeb' : '#fff' }}>
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
