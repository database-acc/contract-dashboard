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
  count: number
}

// 拼成 yyyy-mm-dd
function makeKey(y:number, m:number, d:number) {
  const yy = String(y)
  const mm = String(m).padStart(2,'0')
  const dd = String(d).padStart(2,'0')
  return `${yy}-${mm}-${dd}`
}

// 马来西亚格式 DD/MM/YYYY
function formatMyDate(isoStr: string) {
  const [y, m, d] = isoStr.split('-')
  return `${d}/${m}/${y}`
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
      if(!row.schedule_date) return
      // 优先用表里自带 schedule_year / schedule_month，只拿day
      const dStr = row.schedule_date.split('-')[2]
      const d = Number(dStr)
      const y = row.schedule_year
      const m = row.schedule_month
      const dateKey = makeKey(y,m,d)

      if (!map.has(dateKey)) {
        map.set(dateKey, { dateStr: dateKey, list: [], count: 0 })
      }
      const item = map.get(dateKey)!
      item.list.push({ branch_name: row.branch_name, plan: row.plan })
      item.count += 1
    })
    return map
  }, [assignList])

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
    const weekStart = firstDayOfMonth.getDay()
    const days: Array<{
      dayNum: number
      dateStr: string
      dayInfo: DayItem | undefined
      isOtherMonth: boolean
    }> = []

    // 上月尾巴
    for (let i = weekStart - 1; i >= 0; i--) {
      const dObj = new Date(currentYear, currentMonth, 1 - (i + 1))
      const ds = makeKey(dObj.getFullYear(), dObj.getMonth()+1, dObj.getDate())
      days.push({ dayNum: dObj.getDate(), dateStr: ds, dayInfo: dayMap.get(ds), isOtherMonth: true })
    }

    // 当月格子 key
    for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
      const ds = makeKey(currentYear, currentMonth+1, d)
      days.push({ dayNum: d, dateStr: ds, dayInfo: dayMap.get(ds), isOtherMonth: false })
    }

    // 下月补齐格子
    let addDay = 1
    while (days.length < 42) {
      const dObj = new Date(currentYear, currentMonth + 1, addDay)
      const ds = makeKey(dObj.getFullYear(), dObj.getMonth()+1, dObj.getDate())
      days.push({ dayNum: dObj.getDate(), dateStr: ds, dayInfo: dayMap.get(ds), isOtherMonth: true })
      addDay++
    }
    return days
  }, [currentYear, currentMonth, dayMap])

  const selectedDayData = useMemo(() => {
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 w-full max-w-md mx-auto">
      <h1 className="text-xl font-bold text-center mb-4">Staff Work Schedule</h1>

      <div className="flex items-center justify-between mb-3">
        <button onClick={goPrev} className="px-3 py-1 bg-gray-200 rounded text-sm">◀ Prev</button>
        <div className="font-semibold">{monthNames[currentMonth]} {currentYear}</div>
        <button onClick={goNext} className="px-3 py-1 bg-gray-200 rounded text-sm">Next ▶</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2 text-xs text-center font-medium">
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
          const hasJob = !!day.dayInfo && day.dayInfo.count > 0
          return (
            <div
              key={idx}
              onClick={() => {
                if (!day.isOtherMonth) {
                  setSelectedDate(isSelected ? null : day.dateStr)
                }
              }}
              className={`
                relative border rounded overflow-hidden cursor-pointer aspect-square flex items-center justify-center text-sm
                ${day.isOtherMonth ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-sky-50'}
                ${isSelected ? 'bg-sky-100 border-sky-400' : ''}
              `}
            >
              {day.dayNum}
              {hasJob && !day.isOtherMonth && (
                <span className="absolute bottom-0.5 right-0.5 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-orange-500 rounded-full z-50">
                  {day.dayInfo?.count}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-5">
        {selectedDayData ? (
          <div className="bg-white border rounded p-3 shadow-sm">
            <h2 className="font-semibold mb-2">📅 {formatMyDate(selectedDayData.dateStr)}</h2>
            <div className="space-y-2">
              {selectedDayData.list.map((item, i) => (
                <div key={i} className="border-l-4 border-sky-400 pl-3 py-1">
                  <div className="font-medium">{item.branch_name}</div>
                  <div className="text-sm text-gray-600">Job: {item.plan}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-4">Tap date (orange badge) to view jobs</div>
        )}
      </div>
    </div>
  )
}
