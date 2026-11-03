'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const adminRes = await fetch('/api/get-profile-by-loginid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId })
    })
    const profileResult = await adminRes.json()

    if (!adminRes.ok || !profileResult.success) {
      setErrorMsg(profileResult.error ?? 'Invalid User ID')
      setLoading(false)
      return
    }

    const email = profileResult.data.email
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (signInErr) {
      setErrorMsg('Incorrect Password')
      setLoading(false)
      return
    }

    await fetch('/api/set-auth-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: data.session })
    })

    router.push('/dashboard')
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* 左侧图片区域：按参考图比例放大到约 2/3 */}
      <div
        className="hidden lg:block lg:w-2/3 bg-cover bg-center relative"
        style={{ backgroundImage: `url(/login-bg.jpg)` }}
      >
        <div className="absolute inset-0 bg-black/35"></div>
      </div>

      {/* 右侧登录表单：约 1/3 */}
      <div className="w-full lg:w-1/3 flex items-center justify-center bg-white p-6 md:p-10">
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <h2 className="text-xl md:text-2xl font-bold mb-8">
            Contract Schedule Dashboard
          </h2>

          {errorMsg && <p className="text-red-600 mb-4 text-sm">{errorMsg}</p>}

          <div className="mb-5">
            <label className="block mb-2 text-sm text-gray-700">User ID</label>
            <input
              type="text"
              className="w-full border border-gray-300 p-3 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-400 transition"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              placeholder="Enter User ID"
              disabled={loading}
            />
          </div>

          <div className="mb-7">
            <label className="block mb-2 text-sm text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full border border-gray-300 p-3 pr-10 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-400 transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter Password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm hover:text-gray-700"
                tabIndex={-1}
                disabled={loading}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-700 text-white py-3 rounded hover:bg-green-800 disabled:opacity-50 text-base"
          >
            {loading ? 'Logging in...' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
