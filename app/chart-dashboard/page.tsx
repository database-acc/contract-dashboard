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
  bill_date: string | null
}

export default function ChartDashboard() {
  const router = useRouter()
  const [year, setYear] = useState(2026)
  const [servicePieData, setServicePieData] = useState<ServicePieItem[]>([])
  const [monthBarData, setMonthBarData] = useState<MonthBarItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('maintenance_bills')
        .select('service_type, bill_date')

      if (error) {
        console.error('supabase error:', error)
        setLoading(false)
        return
      }
      console.log('raw bills data:', data)

      const serviceMap: Record<string, number> = {}
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 0, Mar: 0, Apr: 0, May: 0, Jun: 0,
        Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 0,
      }

      data.forEach((row: ChartRow) => {
        if (!row.bill_date) return
        const d = new Date(row.bill_date)
        const rowYear = d.getFullYear()
        if(rowYear !== year) return

        // 统计 service type
        const s = row.service_type || 'Unknown'
        serviceMap[s] = (serviceMap[s] || 0) + 1

        // 从日期自动拿月份，不再依赖 row.month 字段
        const mIndex = d.getMonth()
        const mName = MONTH_SHORT[mIndex]
        monthMap[mName] += 1
      })

      const pieArr: ServicePieItem[] = Object.entries(serviceMap).map(([name, value]) => ({ name, value }))
      const barArr: MonthBarItem[] = Object.entries(monthMap).map(([name, count]) => ({ name, count }))

      console.log('pie data', pieArr)
      console.log('bar data', barArr)
      setServicePieData(pieArr)
      setMonthBarData(barArr)
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
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h2 className="font-semibold mb-4">Monthly Job Count</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
