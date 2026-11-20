'use client'

type FullScreenLoadingProps = {
  text?: string
  show?: boolean
}

export default function FullScreenLoading({
  text = 'Loading...',
  show = true,
}: FullScreenLoadingProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-10 py-8 shadow-xl">
        <div className="w-14 h-14 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin"></div>
        <p className="text-base text-slate-700 font-medium">{text}</p>
      </div>
    </div>
  )
}
