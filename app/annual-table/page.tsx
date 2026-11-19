import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import AnnualTableDataLoader from './AnnualTableDataLoader'

const FullScreenLoading = dynamic(() => import('@/app/components/FullScreenLoading'), {
  ssr: false
})

type SearchParams = Promise<{ year?: string }>

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  return (
    <main className="p-4">
      <div className="mb-4">
        <a
          href="/dashboard"
          className="px-3 py-1 bg-slate-700 text-white rounded hover:bg-slate-600 inline-block"
        >
          ← Back to Dashboard
        </a>
      </div>
      <Suspense fallback={<FullScreenLoading />}>
        <AnnualTableDataLoader searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
