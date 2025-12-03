'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function SetupUsername() {
  const router = useRouter()
  const supabase = createClient()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)

      // Check if username already set
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (profile && profile.username) {
        router.push('/dashboard')
      }
    }
    checkUser()
  }, [router, supabase])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate username
    if (username.length === 0) {
      setError('Username cannot be empty')
      setLoading(false)
      return
    }

    // Check if username starts with letter or number
    if (!/^[a-zA-Z0-9]/.test(username)) {
      setError('Username must start with a letter or number')
      setLoading(false)
      return
    }

    try {
      // Update profile with username
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ username: username.trim() })
        .eq('id', userId)

      if (updateError) {
        console.error('Update error:', updateError)
        if (updateError.code === '23505') {
          setError('Username already exists. Please choose another.')
        } else {
          setError(`Failed to set username: ${updateError.message}`)
        }
        setLoading(false)
        return
      }

      // Verify the update worked
      const { data: verifyProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single()

      if (!verifyProfile || !verifyProfile.username) {
        setError('Failed to verify username update. Please try again.')
        setLoading(false)
        return
      }

      // Success! Force a hard redirect with page reload
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Caught error:', err)
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Choose Your Username
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          This is how others will find and identify you
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Must start with a letter or number
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Setting up...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}