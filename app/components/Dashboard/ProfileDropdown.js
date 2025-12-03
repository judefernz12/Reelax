'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ProfileDropdown({ user, profile }) {
  const router = useRouter()
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showUsernameChange, setShowUsernameChange] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [error, setError] = useState('')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleUsernameChange = async (e) => {
    e.preventDefault()
    setError('')

    if (!/^[a-zA-Z0-9]/.test(newUsername)) {
      setError('Username must start with a letter or number')
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username: newUsername })
      .eq('id', user.id)

    if (updateError) {
      if (updateError.code === '23505') {
        setError('Username already exists')
      } else {
        setError('Failed to update username')
      }
      return
    }

    setShowUsernameChange(false)
    setNewUsername('')
    window.location.reload()
  }

  const toggleTheme = async () => {
    const newTheme = profile.theme === 'light' ? 'dark' : 'light'
    await supabase
      .from('profiles')
      .update({ theme: newTheme })
      .eq('id', user.id)

    window.location.reload()
  }

  const handleDeleteAccount = async () => {
    if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      // Delete profile and related data (cascading deletes handle the rest)
      await supabase.from('profiles').delete().eq('id', user.id)
      await supabase.auth.signOut()
      router.push('/login')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-300 hover:border-blue-500 transition-colors"
      >
        <img
          src={profile.avatar_url || '/default-avatar.png'}
          alt="Profile"
          className="w-full h-full object-cover"
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <p className="font-semibold text-gray-900 dark:text-white">
                {profile.username}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {user.email}
              </p>
            </div>

            <div className="p-2">
              <button
                onClick={toggleTheme}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-700 dark:text-gray-300"
              >
                🌙 Toggle Theme ({profile.theme})
              </button>

              <button
                onClick={() => {
                  setShowUsernameChange(true)
                  setIsOpen(false)
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-700 dark:text-gray-300"
              >
                ✏️ Change Username
              </button>

              <button
                onClick={() => {
                  setShowSettings(true)
                  setIsOpen(false)
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-700 dark:text-gray-300"
              >
                🔒 Privacy Settings
              </button>

              <button
                onClick={handleDeleteAccount}
                className="w-full text-left px-4 py-2 hover:bg-red-100 dark:hover:bg-red-900 rounded transition-colors text-red-600 dark:text-red-400"
              >
                🗑️ Delete Account
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-700 dark:text-gray-300"
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </>
      )}

      {/* Username Change Modal */}
      {showUsernameChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Change Username
            </h3>
            <form onSubmit={handleUsernameChange}>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="New username"
              />
              {error && (
                <p className="text-red-600 text-sm mb-4">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUsernameChange(false)
                    setNewUsername('')
                    setError('')
                  }}
                  className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Privacy Settings Modal - Simple Block Management */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Privacy Settings
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Manage your blocked users and privacy preferences here.
            </p>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}