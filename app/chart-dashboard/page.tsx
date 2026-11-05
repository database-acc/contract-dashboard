'use client'
import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SERVICE_COLOR_MAP: Record<string, string> = {
  GWM: '#0ea5e9',
  KPM: '#8b5cf6',
  KPS: '#10b981',
  GTC: '#f59e0b',
  Unknown: '#6b7280'
}
const DEFAULT_COLOR = '#6b7280'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type ServicePieItem = {
  name: string
  value: number
}

type MonthBarItem = {
  name: string
  count: number
}

type ChartRow = {
  service_type: string | null
  schedule_month_ref: string | null
  month: string | null
  description: string | null
  project: string | null
}

// 解析年月，优先 schedule_month_ref (yyyy-mm)，为空则用 month 字段
function parseYearMonth(row: ChartRow): { year: number | null; monthIndex: number | null } {
  if (row.schedule_month_ref) {
    const [yStr, mStr] = row.schedule_month_ref.split('-')
    const y = Number(yStr)
    const m = Number(mStr) - 1
    if (!isNaN(y) && !isNaN(m) && m >=0 && m <=11) {
      return { year: y, monthIndex: m }
    }
  }
  if (row.month) {
    const d = new Date(row.month)
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), monthIndex: d.getMonth() }
    }
  }
  return { year: null, monthIndex: null }
}

// 新版分类规则
function getFinalServiceType(row: ChartRow): string {
  // 有 service_type 直接优先使用
  if (row.service_type) {
    return row.service_type
  }
  const desc = row.description?.trim() ?? ''
  const descLower = desc.toLowerCase()

  if (descLower === 'plumbing works' || descLower === 'plumbing work') {
    // plumbing works / work 这里你说可以是 KPS / KPM
    // 👉 这里有个关键点：没有其他字段判断区分KPS还是KPM，我先标记Unknown；
    // 如果你后续有规则区分这两个，我们再改
    return 'Unknown'
  }

  if (desc === 'KITCHEN PIPELINE SERVICE') return 'KPS'
  if (desc === 'GREASE WASTE MANAGEMENT') return 'GWM'
  if (desc === 'GREASE TRAP CLEARANCE') return 'GTC'
  if (desc === 'KITCHEN PIPELINE MANAGEMENT') return 'KPM'

  return 'Unknown'
}

export default function ChartDashboard() {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [servicePieData, setServicePieData] = useState<ServicePieItem[]>([])
  const [monthBarData, setMonthBarData] = useState<MonthBarItem[]>([])
  const [totalJobs, setTotalJobs] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('maintenance_bills')
        .select('service_type, schedule_month_ref, month, description, project')

      if (error) {
        console.error('supabase error:', error)
        setLoading(false)
        return
      }
      console.log('raw bills data all:', data)

      const serviceMap: Record<string, number> = {}
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 0, Mar: 0, Apr: 0, May: 0, Jun: 0,
        Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 0,
      }

      data.forEach((row: ChartRow) => {
        // 过滤 project 包含 contract
        const projectText = row.project ?? ''
        if (!projectText.toLowerCase().includes('contract')) return

        const { year: rowYear, monthIndex } = parseYearMonth(row)
        if (rowYear === null || monthIndex === null) return
        if (rowYear !== year) return

        const sType = getFinalServiceType(row)
        serviceMap[sType] = (serviceMap[sType] || 0) + 1

        const mName = MONTH_SHORT[monthIndex]
        monthMap[mName] += 1
      })

      const pieArr: ServicePieItem[] = Object.entries(serviceMap).map(([name, value]) => ({ name, value }))
      const barArr: MonthBarItem[] = Object.entries(monthMap).map(([name, count]) => ({ name, count }))
      const total = pieArr.reduce((sum, item) => sum + item.value, 0)

      console.log('filtered pie data for ' + year, pieArr)
      setServicePieData(pieArr)
      setMonthBarData(barArr)
      setTotalJobs(total)
      setLoading(false)
    }
    fetchData()
  }, [year])

  return (
    <div className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-100"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold">Contract Chart Dashboard</h1>
            <p className="text-sm text-gray-500">Overview of maintenance bills</p>
          </div>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border px-3 py-2 rounded"
        >
          <option value={2026}>2026</option>
          <option value={2027}>2027</option>
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center">Loading chart data...</div>
      ) : (
        <>
          <div className="border rounded-lg p-5 bg-white shadow-sm mb-6">
            <p className="text-gray-500 text-sm">Total Maintenance Jobs ({year})</p>
            <p className="text-4xl font-bold text-slate-800 mt-1">{totalJobs}</p>
            {totalJobs <= 1 && (
              <p className="text-orange-500 text-sm mt-2">⚠️ Only limited records found for this year, please check your maintenance_bills table.</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4 bg-white shadow-sm">
              <h2 className="font-semibold mb-4">Service Type Distribution</h2>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={servicePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {servicePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={SERVICE_COLOR_MAP[entry.name] ?? DEFAULT_COLOR} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val, name) => [`${val} record(s)`, name === 'Unknown' ? 'No service type assigned' : name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="border rounded-lg p-4 bg-white shadow-sm">
              <h2 className="font-semibold mb-4">Monthly Job Count</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthBarData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(val) => [`${val} job(s)`]} />
                  <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
