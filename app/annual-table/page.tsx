import { Suspense } from 'react'
import AnnualTableDataLoader from './AnnualTableDataLoader'

type SearchParams = Promise<{ year?: string }>

// ❗不要在这里 await searchParams，直接把promise往下传
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
      {/* searchParams 在子组件内部再await，子组件放在Suspense里面 */}
      <Suspense fallback={<div className="p-4">Loading Annual Schedule...</div>}>
        <AnnualTableDataLoader searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
