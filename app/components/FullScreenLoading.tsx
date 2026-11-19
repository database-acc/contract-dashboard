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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-8 py-6 shadow-lg">
        <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-green-700 animate-spin"></div>
        <p className="text-sm text-gray-600 font-medium">{text}</p>
      </div>
    </div>
  )
}
