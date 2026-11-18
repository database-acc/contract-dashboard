import './globals.css'
import type { Metadata } from 'next'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'Maintenance System',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || ''

  // 判断是否手机设备
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  // iPad 平板很多UA会命中上面正则，微调：简单区分，你如果希望平板可以访问业务页面：
  const realMobile = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

  // 获取当前路径
  const pathname = headersList.get('x‑next‑url') || ''
  const isStaffSchedulePage = pathname.startsWith('/staff‑schedule')

  // 如果是真正手机 并且 不是staff‑schedule页面：展示手机禁止访问提示
  if(realMobile && !isStaffSchedulePage){
    return (
      <html lang="en">
        <body>
          <div className="min‑h‑screen flex items‑center justify‑center p‑4 text‑center">
            <div>
              <h1 className="text‑xl font‑bold mb‑3">Not supported on Mobile Phone</h1>
              <p className="text‑gray‑600">Please use Computer / Tablet to open this page.</p>
              <p className="mt‑4 text‑sm">Only <a href="/staff‑schedule" className="text‑blue‑600 underline">Staff Mobile Schedule</a> supports mobile phone.</p>
            </div>
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
