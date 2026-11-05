'use client'
import { useEffect, useState } from 'react'

export default function DeviceGuard({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    // 匹配手机、平板设备
    const isMobileDevice = /android|iphone|ipod|ipad|blackberry|webos|mobile/.test(ua)
    setIsMobile(isMobileDevice)
    setLoaded(true)
  }, [])

  if (!loaded) return null

  if (isMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-8 rounded-xl shadow-md text-center max-w-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-3">Desktop Only System</h2>
          <p className="text-slate-600">
            This dashboard is designed for laptop / desktop computer only.<br/>
            Please access from a PC.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
