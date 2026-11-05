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
  GTC: '#10b981',
  Unknown: '#6b7280'
}
const DEFAULT_COLOR = '#6b7280'

// 自然年顺序 Jan → Dec
const CALENDAR_MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_MAP: Record<string, number> = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
}

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

// 返回：calendarYear, monthIndex
function parseYearMonth(row: ChartRow): { calendarYear: number | null; monthIndex: number | null } {
  if (row.schedule_month_ref) {
    const [yStr, mStr] = row.schedule_month_ref.split('-')
    const y = Number(yStr)
    const m = Number(mStr) - 1
    if (!isNaN(y) && !isNaN(m) && m >=0 && m <=11) {
      return { calendarYear: y, monthIndex: m }
    }
  }
  if (row.month) {
    const parts = row.month.trim().split('-')
    if (parts.length === 2) {
      const mStr = parts[0]
      const yyStr = parts[1]
      const mIdx = MONTH_MAP[mStr]
      if (mIdx !== undefined) {
        const calendarY = Number(yyStr) + 2000
        return { calendarYear: calendarY, monthIndex: mIdx }
      }
    }
  }
  return { calendarYear: null, monthIndex: null }
}

function getFinalServiceType(row: ChartRow): string {
  if (row.service_type) {
    return row.service_type
  }
  const desc = row.description?.trim() ?? ''
  const descLower = desc.toLowerCase()

  if (descLower === 'plumbing works' || descLower === 'plumbing work') {
    return 'Unknown'
  }
  if (descLower === 'kitchen pipeline service') return 'KPS'
  if (descLower === 'grease waste management') return 'GWM'
  if (descLower === 'grease trap clearance') return 'GTC'
  if (descLower === 'kitchen pipeline management') return 'KPM'

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

      const serviceMap: Record<string, number> = {}
      const monthMap: Record<string, number> = {}
      CALENDAR_MONTH_ORDER.forEach(m => monthMap[m] = 0)

      data.forEach((row: ChartRow) => {
        const projectText = row.project ?? ''
        const projectOk = projectText.toLowerCase().includes('contract')
        const { calendarYear, monthIndex } = parseYearMonth(row)
        const serviceLabel = getFinalServiceType(row)

        if (!projectOk) return
        if (calendarYear === null || monthIndex === null) return
        // 严格匹配自然年
        if (calendarYear !== year) return

        serviceMap[serviceLabel] = (serviceMap[serviceLabel] || 0) + 1
        const mName = Object.entries(MONTH_MAP).find(([_,v])=>v===monthIndex)?.[0]
        if(mName && monthMap[mName] !== undefined) monthMap[mName] += 1
      })

      const pieArr: ServicePieItem[] = Object.entries(serviceMap).map(([name, value]) => ({ name, value }))
      const barArr: MonthBarItem[] = CALENDAR_MONTH_ORDER.map(name => ({ name, count: monthMap[name] }))
      const total = pieArr.reduce((sum, item) => sum + item.value, 0)

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
            <p className="text-sm text-gray-500">Overview of maintenance bills (Calendar Year: Jan ~ Dec)</p>
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
            <p className="text-gray-500 text-sm">Total Maintenance Jobs (Calendar Year {year})</p>
            <p className="text-4xl font-bold text-slate-800 mt-1">{totalJobs}</p>
            {totalJobs === 0 && (
              <p className="text-orange-500 text-sm mt-2">⚠️ No matching records found for this calendar year.</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4 bg-white shadow-sm">
              <h2 className="font-semibold mb-4">Service Type Distribution</h2>
              {servicePieData.length === 0 ? (
                <div className="h-[320px] flex items-center justify-center text-gray-400">No matching records</div>
              ) : (
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
              )}
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
