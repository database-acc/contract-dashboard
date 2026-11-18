'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function DeviceGuard({ children }: { children: React.ReactNode }) {
  const [isRealMobilePhone, setIsRealMobilePhone] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    // 只匹配真正手机：Android / iPhone / iPod，iPad不拦截
    const checkPhone = /android|iphone|ipod|blackberry|webos|iemobile|opera mini/.test(ua)
    setIsRealMobilePhone(checkPhone)
    setLoaded(true)
  }, [])

  if (!loaded) return null

  // ✅ 手机 + 不是staff‑schedule页面 → 显示拦截提示
  if (isRealMobilePhone && !pathname.startsWith('/staff-schedule')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-3">Desktop / Tablet Only System</h2>
          <p className="text-slate-600 mb-4">
            This dashboard is designed for laptop, desktop or tablet only.<br/>
            Please access from PC or Tablet.
          </p>
          <a
            href="/staff-schedule"
            className="inline-block bg-sky-500 text-white px-4 py-2 rounded-md hover:bg-sky-600"
          >
            Open Staff Mobile Schedule
          </a>
        </div>
      </div>
    )
  }

  // ✅ PC / iPad平板 / 手机访问/staff‑schedule → 正常渲染页面
  return <>{children}</>
}
