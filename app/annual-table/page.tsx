import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import AnnualTableDataLoader from './AnnualTableDataLoader'

const FullScreenLoading = dynamic(() => import('@/app/components/FullScreenLoading'))

type SearchParams = Promise<{ year?: string }>

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  return (
    <main className="p-4 bg-white min-h-screen">
      <Suspense fallback={<FullScreenLoading text="Loading Annual Table..." />}>
        {/* 按钮移入Suspense里面，loading阶段不会渲染，就没有朦朦虚影 */}
        <div className="mb-4">
          <a
            href="/dashboard"
            className="px-3 py-1 bg-slate-700 text-white rounded hover:bg-slate-600 inline-block"
          >
            ← Back to Dashboard
          </a>
        </div>
        <AnnualTableDataLoader searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
