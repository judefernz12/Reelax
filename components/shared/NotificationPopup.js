'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NotificationPopup({ notification, onDismiss }) {
  const router = useRouter()
  const supabase = createClient()
  const [timeLeft, setTimeLeft] = useState(10)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (timeLeft <= 0) {
      onDismiss()
    }
  }, [timeLeft, onDismiss])

  const handleAcceptFriendRequest = async () => {
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', notification.id)

    onDismiss()
  }

  const handleDeclineFriendRequest = async () => {
    await supabase
      .from('friendships')
      .delete()
      .eq('id', notification.id)

    onDismiss()
  }

  const handleJoinRoom = async () => {
    // Check if user is currently in another room
    const { data: currentMembership } = await supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name, host_id)')
      .eq('user_id', notification.userId)
      .eq('status', 'joined')
      .eq('is_connected', true)
      .single()

    // If user is in another room
    if (currentMembership && currentMembership.room_id !== notification.data.roomId) {
      const isHostOfCurrentRoom = currentMembership.rooms.host_id === notification.userId

      if (isHostOfCurrentRoom) {
        // Show prompt for hosts
        alert('You are the host of another room. Please transfer hosting and join from dashboard.')
        onDismiss()
        return
      }

      // For regular members, leave current room and join new one
      if (confirm(`You are currently in "${currentMembership.rooms.name}". Leave and join this room?`)) {
        await supabase
          .from('room_members')
          .update({ status: 'left', is_connected: false })
          .eq('room_id', currentMembership.room_id)
          .eq('user_id', notification.userId)

        // Check if room should be deleted (no other joined members)
        const { count } = await supabase
          .from('room_members')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', currentMembership.room_id)
          .eq('status', 'joined')

        if (count === 0) {
          await supabase.from('rooms').delete().eq('id', currentMembership.room_id)
        }

        router.push(`/room/${notification.data.roomId}`)
        onDismiss()
      }
    } else {
      // Not in another room, join directly
      router.push(`/room/${notification.data.roomId}`)
      onDismiss()
    }
  }

  if (notification.type === 'friend_request') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 min-w-[300px] border-l-4 border-blue-500">
        <div className="flex items-start gap-3">
          <img
            src={notification.data.avatar || '/default-avatar.png'}
            alt={notification.data.username}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Friend Request
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold">{notification.data.username}</span> wants to be your friend
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleAcceptFriendRequest}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                ✓ Accept
              </button>
              <button
                onClick={handleDeclineFriendRequest}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                ✗ Decline
              </button>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-1000"
            style={{ width: `${(timeLeft / 10) * 100}%` }}
          />
        </div>
      </div>
    )
  }

  if (notification.type === 'room_invite') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 min-w-[300px] border-l-4 border-purple-500">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">
            R
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Room Invitation
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold">{notification.data.hostUsername}</span> invited you to <span className="font-semibold">{notification.data.roomName}</span>
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleJoinRoom}
                className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
              >
                Join Now
              </button>
              <button
                onClick={onDismiss}
                className="px-3 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-400"
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-1000"
            style={{ width: `${(timeLeft / 10) * 100}%` }}
          />
        </div>
      </div>
    )
  }

  return null
}