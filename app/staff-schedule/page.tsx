'use client'
import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import FullScreenLoading from '../components/FullScreenLoading'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type BillScheduleAssignRow = {
  id: bigint
  branch_name: string
  schedule_year: number
  schedule_month: number
  plan: string
  schedule_date: string | null
  editor_name: string
  editor_role: string
  edited_at: string
}

type DayItem = {
  dateStr: string
  list: Array<{ branch_name: string; plan: string }>
  count: number
}

// 工具函数：把任意日期字符串硬转成本地 YYYY-MM-DD
function toLocalYmd(dateStr: string | null | undefined): string {
  if (!dateStr) return ''

  // 如果已经是 YYYY-MM-DD，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }

  // 否则按本地时间解析，避免 UTC 漂移
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''

  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function StaffSchedulePage() {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [assignList, setAssignList] = useState<BillScheduleAssignRow[]>([])

  const fetchAssign = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('bill_schedule_assign').select('*')
    if (!error && data) {
      setAssignList(data as BillScheduleAssignRow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAssign()
  }, [])

  const dayMap = useMemo(() => {
    const map = new Map<string, DayItem>()

    assignList.forEach((row) => {
      const dateKey = toLocalYmd(row.schedule_date)
      // ✅ Debug log 打印原始值 + 转换后的key
      console.log('🔍 Raw schedule_date:', row.schedule_date)
      console.log('🔑 Converted dateKey:', dateKey)

      if (!dateKey) return

      if (!map.has(dateKey)) {
        map.set(dateKey, { dateStr: dateKey, list: [], count: 0 })
      }

      const item = map.get(dateKey)!
      item.list.push({ branch_name: row.branch_name, plan: row.plan })
      item.count += 1
    })
    console.log('📋 Final dayMap keys:', Array.from(map.keys()))
    return map
  }, [assignList])

  const calendarDays = useMemo(() => {
    const first = new Date(currentYear, currentMonth, 1)
    const last = new Date(currentYear, currentMonth + 1, 0)
    const startWeekDay = first.getDay()

    const days: Array<{
      dayNum: number
      dateObj: Date
      dateStr: string
      dayInfo: DayItem | undefined
      isOtherMonth: boolean
    }> = []

    // 上月尾部填充
    for (let i = startWeekDay - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth, 1)
      d.setDate(d.getDate() - (i + 1))

      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const ds = `${y}-${m}-${day}`

      days.push({
        dayNum: d.getDate(),
        dateObj: d,
        dateStr: ds,
        dayInfo: dayMap.get(ds),
        isOtherMonth: true,
      })
    }

    // 当月日期
    for (let d = 1; d <= last.getDate(); d++) {
      const dateObj = new Date(currentYear, currentMonth, d)

      const y = dateObj.getFullYear()
      const m = String(dateObj.getMonth() + 1).padStart(2, '0')
      const day = String(dateObj.getDate()).padStart(2, '0')
      const ds = `${y}-${m}-${day}`

      days.push({
        dayNum: d,
        dateObj,
        dateStr: ds,
        dayInfo: dayMap.get(ds),
        isOtherMonth: false,
      })
    }

    // 下月头部填充，补齐到 42 格
    const fillTotal = 42
    while (days.length < fillTotal) {
      const nextD = new Date(currentYear, currentMonth + 1, days.length - startWeekDay + 1)

      const y = nextD.getFullYear()
      const m = String(nextD.getMonth() + 1).padStart(2, '0')
      const day = String(nextD.getDate()).padStart(2, '0')
      const ds = `${y}-${m}-${day}`

      days.push({
        dayNum: nextD.getDate(),
        dateObj: nextD,
        dateStr: ds,
        dayInfo: dayMap.get(ds),
        isOtherMonth: true,
      })
    }

    return days
  }, [currentYear, currentMonth, dayMap])

  const selectedDayItems = useMemo(() => {
    if (!selectedDate) return null
    return dayMap.get(selectedDate) ?? null
  }, [selectedDate, dayMap])

  const goPrev = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth((m) => m - 1)
    }
    setSelectedDate(null)
  }

  const goNext = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth((m) => m + 1)
    }
    setSelectedDate(null)
  }

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  if (loading) {
    return <FullScreenLoading text="Loading schedule…" />
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 w-full mx-auto max-w-md">
      <h1 className="text-xl font-bold text-center mb-4">Staff Work Schedule</h1>

      <div className="flex items-center justify-between mb-3">
        <button onClick={goPrev} className="px-3 py-1 bg-gray-200 rounded text-sm">◀ Prev</button>
        <div className="font-semibold">{monthNames[currentMonth]} {currentYear}</div>
        <button onClick={goNext} className="px-3 py-1 bg-gray-200 rounded text-sm">Next ▶</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2 text-xs text-center font-medium text-gray-500">
        <div>Su</div>
        <div>Mo</div>
        <div>Tu</div>
        <div>We</div>
        <div>Th</div>
        <div>Fr</div>
        <div>Sa</div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          const isSelected = selectedDate === day.dateStr
          const jobCount = day.dayInfo?.count ?? 0

          return (
            <div
              key={idx}
              onClick={() => {
                if (!day.isOtherMonth) {
                  setSelectedDate(isSelected ? null : day.dateStr)
                }
              }}
              className={`
                relative border rounded overflow-hidden cursor-pointer aspect-square flex items-center justify-center
                ${day.isOtherMonth ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-sky-50'}
                ${isSelected ? 'bg-sky-100 border-sky-400' : ''}
              `}
            >
              <span className="text-sm">{day.dayNum}</span>

              {jobCount > 0 && !day.isOtherMonth && (
                <span className="absolute bottom-0.5 right-0.5 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-orange-500 rounded-full z-50">
                  {jobCount}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-5">
        {selectedDayItems ? (
          <div className="bg-white border rounded p-3 shadow-sm">
            <h2 className="font-semibold mb-2">📅 {selectedDayItems.dateStr}</h2>

            {selectedDayItems.list.length === 0 ? (
              <p className="text-gray-400">No jobs for this day</p>
            ) : (
              <div className="space-y-2">
                {selectedDayItems.list.map((item, i) => (
                  <div key={i} className="border-l-4 border-sky-400 pl-3 py-1">
                    <div className="font-medium">{item.branch_name}</div>
                    <div className="text-sm text-gray-600">Job: {item.plan}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-4">Tap date (orange badge) to view jobs</div>
        )}
      </div>
    </div>
  )
}
