'use client'
import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-8 py-6 shadow-lg">
        {/* 图标 */}
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m9-5a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-base text-gray-700 font-semibold">Unauthorized</p>
        <p className="text-sm text-gray-500">Please login to continue access this page</p>
        <div className="flex gap-3 mt-1">
          <Link
            href="/login"
            className="px-5 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-800 transition-colors"
          >
            Go to Login
          </Link>
          <Link
            href="/"
            className="px-5 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
