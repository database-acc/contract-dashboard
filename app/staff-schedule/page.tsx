'use client'
import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

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
      if (!row.schedule_date) return
      if (!map.has(row.schedule_date)) {
        map.set(row.schedule_date, { dateStr: row.schedule_date, list: [] })
      }
      const item = map.get(row.schedule_date)!
      item.list.push({ branch_name: row.branch_name, plan: row.plan })
    })
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
      hasSchedule: boolean
      isOtherMonth: boolean
    }> = []

    for (let i = startWeekDay - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth, 1)
      d.setDate(d.getDate() - (i + 1))
      const ds = d.toISOString().split('T')[0]
      days.push({
        dayNum: d.getDate(),
        dateObj: d,
        dateStr: ds,
        hasSchedule: dayMap.has(ds),
        isOtherMonth: true,
      })
    }

    for (let d = 1; d <= last.getDate(); d++) {
      const dateObj = new Date(currentYear, currentMonth, d)
      const ds = dateObj.toISOString().split('T')[0]
      days.push({
        dayNum: d,
        dateObj,
        dateStr: ds,
        hasSchedule: dayMap.has(ds),
        isOtherMonth: false,
      })
    }

    const fillTotal = 42
    while (days.length < fillTotal) {
      const nextD = new Date(currentYear, currentMonth + 1, days.length - startWeekDay + 1)
      const ds = nextD.toISOString().split('T')[0]
      days.push({
        dayNum: nextD.getDate(),
        dateObj: nextD,
        dateStr: ds,
        hasSchedule: dayMap.has(ds),
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

  return (
    <div className="min-h-screen bg-gray-50 p-3 max-w-md mx-auto">
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

          return (
            <div
              key={idx}
              onClick={() => {
                if (!day.isOtherMonth) {
                  setSelectedDate(isSelected ? null : day.dateStr)
                }
              }}
              className={`
                aspect-square border rounded flex items-center justify-center text-sm relative
                ${day.isOtherMonth ? 'bg-gray-100 text-gray-400' : 'bg-white cursor-pointer hover:bg-sky-50'}
                ${isSelected ? 'bg-sky-100 border-sky-400' : ''}
              `}
            >
              {day.dayNum}

              {day.hasSchedule && !day.isOtherMonth && (
                <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="text-center text-gray-500 py-6">Loading schedule…</div>
        ) : selectedDayItems ? (
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
          <div className="text-center text-gray-400 py-4">Tap date (orange dot) to view jobs</div>
        )}
      </div>
    </div>
  )
}
