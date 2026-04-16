import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { refetchAuth } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new URLSearchParams(new FormData(e.target))

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include',
      })

      if (res.ok) {
        await refetchAuth()
        const params = new URLSearchParams(location.search)
        const next = params.get('next')
        navigate(next && next.startsWith('/') ? next : '/system', { replace: true })
      } else {
        const data = await res.json()
        setError(data.detail || 'Authentication failed.')
        showToast('error', data.detail || 'Authentication failed.')
      }
    } catch {
      setError('Network error. Please check your connection.')
      showToast('error', 'Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand/10 rounded-2xl mb-4">
            <i className="fas fa-shield-alt text-brand text-2xl"></i>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Admin Access</h1>
          <p className="text-gray-500 mt-1 font-medium">Sign in to manage your collection</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
              <i className="fas fa-exclamation-circle shrink-0"></i>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Username</label>
              <div className="relative">
                <i className="fas fa-user absolute left-3.5 top-3 text-gray-400 text-sm"></i>
                <input
                  type="text"
                  name="username"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition bg-gray-50 focus:bg-white"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <i className="fas fa-lock absolute left-3.5 top-3 text-gray-400 text-sm"></i>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition bg-gray-50 focus:bg-white"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-hover text-white font-bold py-3 rounded-xl transition shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><i className="fas fa-circle-notch fa-spin"></i> Verifying...</>
              ) : (
                <><span>Authenticate</span><i className="fas fa-arrow-right text-sm"></i></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
