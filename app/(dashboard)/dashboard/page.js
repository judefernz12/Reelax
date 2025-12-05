'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import CreateRoomModal from '@/components/Dashboard/CreateRoomModal'
import RoomList from '@/components/Dashboard/RoomList'
import FriendsList from '@/components/Dashboard/FriendsList'
import ProfileDropdown from '@/components/Dashboard/ProfileDropdown'
import NotificationPopup from '@/components/shared/NotificationPopup'

export default function DashboardPage() {
  const supabase = createClient()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      setProfile(profileData)
      
      // Set user as online
      await supabase
        .from('profiles')
        .update({ online_status: true })
        .eq('id', user.id)
    }
  }

  getUser()

    // Set user as offline when leaving
    return () => {
      if (user) {
        supabase
          .from('profiles')
          .update({ online_status: false })
          .eq('id', user.id)
      }
    }
  }, [supabase])

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return

    // Friend requests subscription
    const friendRequestChannel = supabase
      .channel('friend_requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
        },
        async (payload) => {
          // Only show notification if this user is the recipient (not the requester)
          const isRecipient =
            (payload.new.user1_id === user.id || payload.new.user2_id === user.id) &&
            payload.new.requester_id !== user.id

          if (!isRecipient) return

          // Fetch requester info
          const { data: requester } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.requester_id)
            .single()

          setNotifications((prev) => [
            ...prev,
            {
              id: payload.new.id,
              type: 'friend_request',
              data: {
                requesterId: payload.new.requester_id,
                username: requester?.username,
                avatar: requester?.avatar_url,
                timestamp: payload.new.created_at,
              },
            },
          ])
        }
      )
      .subscribe()

    // Room invitations subscription
    const roomInviteChannel = supabase
      .channel('room_invites')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_members',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          // Fetch room info
          const { data: room } = await supabase
            .from('rooms')
            .select('*, profiles!rooms_host_id_fkey(username, avatar_url)')
            .eq('id', payload.new.room_id)
            .single()

          setNotifications((prev) => [
            ...prev,
            {
              id: payload.new.id,
              type: 'room_invite',
              data: {
                roomId: room.id,
                roomName: room.name,
                hostUsername: room.profiles.username,
                timestamp: payload.new.created_at,
              },
            },
          ])
        }
      )
      .subscribe()

    return () => {
      friendRequestChannel.unsubscribe()
      roomInviteChannel.unsubscribe()
    }
  }, [user, supabase])

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Bar */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reelax  
            </h1>
            <ProfileDropdown user={user} profile={profile} />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Rooms */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  My Rooms
                </h2>
                <button
                  onClick={() => setShowCreateRoom(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  + Create Room
                </button>
              </div>
              <RoomList userId={user.id} />
            </div>
          </div>

          {/* Right Column - Friends */}
          <div>
            <FriendsList userId={user.id} />
          </div>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateRoom && (
        <CreateRoomModal
          userId={user.id}
          onClose={() => setShowCreateRoom(false)}
        />
      )}

      {/* Notifications */}
      <div className="fixed top-20 right-4 space-y-2 z-50">
        {notifications.map((notification) => (
          <NotificationPopup
            key={notification.id}
            notification={notification}
            onDismiss={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </div>
  )
}